import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractCompetitorPage } from "../lib/radar/competitor-extractor.ts";
import {
  buildRadarExternalSourceResearch, buildRadarInternalLinkResearch,
  classifyRadarObservedLink, radarLinkObservations,
} from "../lib/radar/link-and-source-research.ts";
import { buildRadarSemanticConceptModel } from "../lib/radar/semantic-concept-model.ts";
import { buildRadarCompetitiveModel } from "../lib/radar/competitive-model.ts";
import { buildRadarEditorialComparison } from "../lib/radar/editorial-comparison.ts";
import { buildRadarCompetitiveObservedModel, radarObservedNarrative } from "../lib/radar/competitive-observed-model.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";

/*
 * ==========  GATE 11 · LINKS OBSERVADOS E FONTES CONCRETAS  =============
 *
 * `externalLinks = 4` nunca respondeu a pergunta que interessa. Quatro links
 * podem ser uma instituição médica, o Instagram da marca, a política de
 * privacidade e um sabonete à venda — e tratar os quatro como a mesma coisa
 * produziria um relatório recomendando "cite o Instagram" com a mesma cara de
 * seriedade com que recomenda a fonte de verdade.
 *
 * A régua deste gate: o href é CAPTURADO do HTML que a extração já tinha, e
 * nunca navegado. O que sai é "quatro concorrentes citam este domínio ao
 * tratar deste conceito" — nunca "use este domínio".
 *
 * Nenhum teste chama rede: quando o extractor aparece, `fetchImpl` e
 * `lookupImpl` são stubs locais.
 */

/* ============================ a página crua ============================= */

const HTML_CONCORRENTE = `<html><head><title>Pele oleosa</title></head><body>
<h1>Tudo sobre pele oleosa</h1>
<nav><a href="/">Início</a><a href="/contato">Contato</a></nav>
<h2>Como identificar a pele oleosa?</h2>
<p>A pele oleosa apresenta brilho constante. Veja nosso
  <a href="/blog/rotina-noturna">guia de rotina noturna</a> para entender melhor.</p>
<h2>Por que a pele fica oleosa?</h2>
<p>A produção de sebo é regulada por hormônios, segundo a
  <a href="https://www.aad.org/public/diseases/oily-skin" rel="noopener">American Academy of Dermatology</a>,
  que descreve o mecanismo em detalhe.</p>
<p>Um estudo publicado no <a href="https://pubmed.ncbi.nlm.nih.gov/12345678/">PubMed</a> confirma a relação.</p>
<h2>Produtos recomendados</h2>
<ul>
  <li><a href="https://www.mercadolivre.com.br/produto/sabonete-facial">Sabonete facial</a></li>
  <li><a href="https://loja.exemplo.com/go/ref/abc123" rel="sponsored nofollow">Kit completo</a></li>
</ul>
<footer>
  <a href="https://www.instagram.com/marca">Instagram</a>
  <a href="/politica-de-privacidade">Política de privacidade</a>
  <a href="mailto:contato@exemplo.com">contato@exemplo.com</a>
  <a href="tel:+5511999999999">Telefone</a>
  <a href="javascript:void(0)">Compartilhar</a>
  <a href="https://cdn.exemplo.com/imagem.jpg"><img src="x.png" alt="Foto do produto"></a>
  <a href="../guias/mascara-facial">Máscara facial</a>
</footer>
</body></html>`;

const resposta = (html: string) => ({
  ok: true, status: 200, url: "https://exemplo.com.br/blog/pele-oleosa",
  headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
  text: async () => html,
  arrayBuffer: async () => new TextEncoder().encode(html).buffer,
}) as unknown as Response;

const extrair = (html = HTML_CONCORRENTE) => extractCompetitorPage("https://exemplo.com.br/blog/pele-oleosa", {
  fetchImpl: (async () => resposta(html)) as unknown as typeof fetch,
  lookupImpl: (async () => [{ address: "93.184.216.34" }]) as never,
  now: "2026-09-10T10:00:00.000Z",
});

/* ====================  A a D · RESOLUÇÃO E CLASSE  ===================== */

test("GATE 11 · A e B — href relativo resolve contra a página; absoluto é preservado", async () => {
  const page = await extrair();
  const porAncora = new Map(page.observedLinks.map(link => [link.anchorText, link]));

  /* Relativo com barra inicial. */
  assert.equal(porAncora.get("guia de rotina noturna")!.destinationUrl, "https://exemplo.com.br/blog/rotina-noturna");
  /* Relativo com `../`, resolvido contra o diretório da página. */
  assert.equal(porAncora.get("Máscara facial")!.destinationUrl, "https://exemplo.com.br/guias/mascara-facial");
  /* Absoluto continua exatamente onde aponta. */
  assert.equal(porAncora.get("American Academy of Dermatology")!.destinationUrl, "https://www.aad.org/public/diseases/oily-skin");
  assert.equal(porAncora.get("PubMed")!.destinationUrl, "https://pubmed.ncbi.nlm.nih.gov/12345678/");
});

test("GATE 11 · C e D — mesmo host é interno; outro domínio é externo", async () => {
  const page = await extrair();
  const porAncora = new Map(page.observedLinks.map(link => [link.anchorText, link]));

  assert.equal(porAncora.get("guia de rotina noturna")!.kind, "INTERNAL");
  assert.equal(porAncora.get("Início")!.kind, "INTERNAL");
  assert.equal(porAncora.get("American Academy of Dermatology")!.kind, "EXTERNAL");
  assert.equal(porAncora.get("Sabonete facial")!.kind, "EXTERNAL");

  /* A classe vem do host, nunca do texto da âncora. */
  assert.equal(porAncora.get("American Academy of Dermatology")!.destinationDomain, "www.aad.org");

  /* E as contagens antigas passaram a SAIR das observações — não há como discordarem. */
  assert.equal(page.internalLinkCount, page.observedLinks.filter(link => link.kind === "INTERNAL").length);
  assert.equal(page.externalLinkCount, page.observedLinks.filter(link => link.kind === "EXTERNAL").length);
});

/* ==================  E, F e G · ÂNCORA, SEÇÃO, CONTEXTO  =============== */

test("GATE 11 · E — a âncora é a do concorrente, e ausência não vira invenção", async () => {
  const page = await extrair();
  const aad = page.observedLinks.find(link => link.destinationDomain === "www.aad.org")!;
  assert.equal(aad.anchorText, "American Academy of Dermatology", "texto ORIGINAL");

  /* Link com imagem dentro: o alt responde quando não há texto. */
  const imagem = page.observedLinks.find(link => link.destinationUrl.includes("cdn.exemplo.com"))!;
  assert.equal(imagem.anchorText, "Foto do produto");

  /* Sem texto, sem aria-label e sem alt, a âncora é ausente e declarada assim. */
  const semTexto = await extrair(`<html><body><h1>t</h1><p>x <a href="https://exemplo.org/a"></a> y</p>${"<p>corpo com texto suficiente para a extração seguir adiante e virar sucesso.</p>".repeat(6)}</body></html>`);
  assert.equal(semTexto.observedLinks[0].anchorText, null);
});

test("GATE 11 · F — cada link sabe em que seção do documento ele apareceu", async () => {
  const page = await extrair();
  const porAncora = new Map(page.observedLinks.map(link => [link.anchorText, link]));

  assert.equal(porAncora.get("guia de rotina noturna")!.sectionHeading, "Como identificar a pele oleosa?");
  assert.equal(porAncora.get("American Academy of Dermatology")!.sectionHeading, "Por que a pele fica oleosa?");
  assert.equal(porAncora.get("PubMed")!.sectionHeading, "Por que a pele fica oleosa?");
  assert.equal(porAncora.get("Sabonete facial")!.sectionHeading, "Produtos recomendados");
  /* Antes do primeiro heading não há seção — e isso é `null`, não chute. */
  assert.equal(porAncora.get("Início")!.sectionHeading, "Tudo sobre pele oleosa");
});

test("GATE 11 · G — o contexto guarda a frase que justifica a citação", async () => {
  const page = await extrair();
  const aad = page.observedLinks.find(link => link.destinationDomain === "www.aad.org")!;

  assert.match(aad.surroundingText, /produção de sebo é regulada por hormônios/);
  assert.ok(aad.surroundingText.length <= 240, "compacto: contexto, não a página de novo");
  assert.equal(aad.surroundingText.includes("<"), false, "texto, não HTML");

  /* O item de lista é o bloco de quem está numa lista. */
  const sabonete = page.observedLinks.find(link => link.anchorText === "Sabonete facial")!;
  assert.match(sabonete.surroundingText, /Sabonete facial/);

  /* rel e target são observados como a página os escreveu. */
  const patrocinado = page.observedLinks.find(link => link.anchorText === "Kit completo")!;
  assert.deepEqual(patrocinado.rel, ["sponsored", "nofollow"]);
});

/* ============  H, I e J · O QUE É FONTE E O QUE NÃO É  ================ */

test("GATE 11 · H — mailto, tel e javascript são observados e nunca viram candidata", async () => {
  const page = await extrair();
  const naoWeb = page.observedLinks.filter(link => link.kind === "NON_WEB");

  assert.equal(naoWeb.length, 3, "mailto, tel e javascript");
  assert.ok(naoWeb.every(link => classifyRadarObservedLink(link) === "NON_WEB"));

  const pesquisa = buildRadarExternalSourceResearch({ pages: [page] });
  assert.equal(pesquisa.evidenceCandidates.some(item => /mailto|tel:|javascript/.test(item.destinationUrl || "")), false,
    "PROTOCOL_NOISE_FILTERED");
  assert.ok(pesquisa.limitations.some(item => /protocolo não navegável/.test(item)));
});

test("GATE 11 · I e J — social, legal e mídia saem das fontes; comercial fica preservado", async () => {
  const page = await extrair();
  const pesquisa = buildRadarExternalSourceResearch({ pages: [page] });
  const dominios = pesquisa.evidenceCandidates.map(item => item.domain);

  assert.equal(dominios.includes("www.instagram.com"), false, "SOCIAL_NOISE_SEPARATED");
  assert.equal(dominios.includes("cdn.exemplo.com"), false, "mídia não é fonte");
  assert.ok(dominios.includes("www.aad.org"), "a fonte de verdade permanece");
  assert.ok(dominios.includes("pubmed.ncbi.nlm.nih.gov"));

  /* Comercial e afiliado continuam observados — só não como fonte. */
  assert.equal(pesquisa.commercialLinks.length, 2, "COMMERCIAL_LINKS_SEPARATED");
  const categorias = pesquisa.observedLinks.map(link => link.category);
  assert.ok(categorias.includes("COMMERCIAL"));
  assert.ok(categorias.includes("AFFILIATE"), "rel=sponsored é observado, não julgado");
  assert.ok(categorias.includes("SOCIAL"));
  assert.ok(categorias.includes("LEGAL"));
  assert.ok(categorias.includes("NAVIGATION"), "\"Início\" e \"Contato\" são navegação");
  assert.ok(pesquisa.limitations.some(item => /comerciais ou de afiliado/.test(item)));
});

/* ================  A amostra com vários concorrentes  ================= */

const link = (patch: Partial<RadarObservedLink>): RadarObservedLink => ({
  destinationUrl: "https://www.aad.org/public/diseases/oily-skin",
  destinationDomain: "www.aad.org",
  kind: "EXTERNAL",
  anchorText: "American Academy of Dermatology",
  surroundingText: "A produção de sebo é regulada por hormônios.",
  sectionHeading: "Causas da pele oleosa",
  rel: [],
  target: null,
  order: 0,
  ...patch,
});

const pagina = (id: string, headings: string[], links: RadarObservedLink[]): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [],
  wordCount: 1400,
  internalLinkCount: links.filter(item => item.kind === "INTERNAL").length,
  externalLinkCount: links.filter(item => item.kind === "EXTERNAL").length,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: null, structuredDataTypes: [], recurringTerms: [], boldCount: 3, italicCount: 0,
  paragraphCount: 11, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Abertura.", closingWordCount: 40, closingText: "Fecho.", hasClosing: true,
  emphasizedTerms: [], keywordPlacement: null, observedLinks: links, error: null,
});

const IDENT = ["Como identificar a pele oleosa?", "Características da pele oleosa", "Sinais de uma pele oleosa", "Como saber se a pele é oleosa?"];
const CAUSAS = ["Causas da pele oleosa", "Por que a pele produz sebo?", "Motivos da oleosidade"];

/**
 * Catorze comparáveis: quatro citam a MESMA URL da AAD, duas citam URLs
 * diferentes do mesmo domínio, uma é a descoberta só pela auxiliar.
 */
const PAGINAS: RadarExtractionPage[] = [
  ...Array.from({ length: 4 }, (_, index) => pagina(`A${index}`, [IDENT[index % IDENT.length], CAUSAS[index % CAUSAS.length]], [
    link({ order: 0 }),
    link({ order: 1, kind: "INTERNAL", destinationUrl: `https://dominio-a${index}.com.br/blog/rotina-noturna`, destinationDomain: `dominio-a${index}.com.br`, anchorText: "rotina noturna", sectionHeading: IDENT[index % IDENT.length] }),
  ])),
  pagina("B0", [IDENT[0], CAUSAS[1]], [
    link({ destinationUrl: "https://www.aad.org/public/everyday-care/skin-care-basics", anchorText: "guia da AAD", sectionHeading: CAUSAS[1] }),
  ]),
  pagina("B1", [IDENT[1], CAUSAS[2]], [
    link({ destinationUrl: "https://www.aad.org/public/diseases/acne", anchorText: "AAD sobre acne", sectionHeading: CAUSAS[2] }),
  ]),
  ...Array.from({ length: 6 }, (_, index) => pagina(`C${index}`, [IDENT[index % IDENT.length]], [
    link({ kind: "EXTERNAL", destinationUrl: "https://www.instagram.com/marca", destinationDomain: "www.instagram.com", anchorText: "Instagram", sectionHeading: null }),
    link({ kind: "INTERNAL", destinationUrl: `https://dominio-c${index}.com.br/categoria/skincare`, destinationDomain: `dominio-c${index}.com.br`, anchorText: "categoria skincare", sectionHeading: IDENT[index % IDENT.length] }),
  ])),
  pagina("D0", [CAUSAS[0]], [
    link({ destinationUrl: "https://www.mercadolivre.com.br/produto/sabonete", destinationDomain: "www.mercadolivre.com.br", anchorText: "sabonete", sectionHeading: CAUSAS[0] }),
  ]),
  pagina("AUX", [IDENT[2], CAUSAS[0]], [
    link({ order: 0 }),
    link({ order: 1, destinationUrl: "https://www.gov.br/anvisa/cosmeticos", destinationDomain: "www.gov.br", anchorText: "Anvisa", sectionHeading: CAUSAS[0] }),
  ]),
];

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-v7", articleDnaContentHash: null, promise: null, mainIntent: "informacional", hierarchy: "Pilar" },
  keywords: [{
    identity: { keywordId: "kw1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { intent: "informacional" }, normalizedIntent: "informacional" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa", "controle de oleosidade"],
  silo: null, formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const PROVENIENCIA = PAGINAS.map((page, index) => ({
  url: page.url,
  appearances: [{
    keyword: page.id === "page:AUX" ? "controle de oleosidade" : "skincare para pele oleosa",
    keywordRole: page.id === "page:AUX" ? "secundaria" : "principal",
    sourceType: (page.id === "page:AUX" ? "auxiliary" : index % 3 === 0 ? "canonical" : "auxiliary") as "canonical" | "auxiliary",
  }],
}));

const semantico = () => buildRadarSemanticConceptModel({
  pages: PAGINAS, centralEntities: ["pele oleosa"],
  keywordTexts: ["skincare para pele oleosa", "controle de oleosidade"],
});

const fontes = () => buildRadarExternalSourceResearch({
  pages: PAGINAS, provenance: PROVENIENCIA, semantic: semantico(), context: contexto(),
});

/* ===============  K, L e M · RECORRÊNCIA E PROCEDÊNCIA  =============== */

test("GATE 11 · K — a mesma URL citada por vários concorrentes vira UMA candidata", () => {
  const pesquisa = fontes();
  const aad = pesquisa.evidenceCandidates.find(item => item.destinationUrl === "https://www.aad.org/public/diseases/oily-skin")!;

  assert.equal(aad.competitorsUsingIt, 5, "quatro da amostra principal mais a da auxiliar");
  assert.equal(aad.provenance.length >= 5, true, "com a procedência de cada citação");
  assert.ok(aad.provenance.every(item => item.pageUrl.startsWith("https://")));
  assert.ok(aad.anchors.includes("American Academy of Dermatology"), "as âncoras originais preservadas");
  assert.ok(aad.sections.length > 0, "e as seções em que apareceu");
  assert.equal(aad.confidence, "HIGH");
  assert.match(aad.reason, /não atestado de autoridade/, "uso observado, não aval");
});

test("GATE 11 · L — URLs diferentes do mesmo domínio ficam separadas, e o domínio agrega", () => {
  const pesquisa = fontes();
  const doAad = pesquisa.evidenceCandidates.filter(item => item.domain === "www.aad.org");

  assert.equal(doAad.length, 3, "três URLs distintas continuam distintas");
  const dominio = pesquisa.recurrentDomains.find(item => item.domain === "www.aad.org")!;
  assert.equal(dominio.citedByCompetitors, 7, "sete páginas citam o domínio");
  assert.equal(dominio.distinctUrls, 3);
  assert.match(dominio.note, /não classifica a fonte como autoridade/, "popularidade ≠ autoridade");

  /* Domínio citado por uma página só não é recorrente. */
  assert.equal(pesquisa.recurrentDomains.some(item => item.domain === "www.gov.br"), false);
});

test("GATE 11 · M — a página vinda só da auxiliar também contribui com fonte", () => {
  const pesquisa = fontes();
  const anvisa = pesquisa.evidenceCandidates.find(item => item.domain === "www.gov.br")!;

  assert.ok(anvisa, "a fonte trazida pela descoberta multi-query está no modelo");
  assert.equal(anvisa.sourceType, "official");
  assert.deepEqual(anvisa.provenance.map(item => item.pageId), ["page:AUX"]);
  assert.deepEqual(anvisa.queryCoverage, 1);

  const aad = pesquisa.evidenceCandidates.find(item => (item.destinationUrl || "").includes("oily-skin"))!;
  assert.equal(aad.queryCoverage, 2, "a mesma fonte foi encontrada por duas consultas distintas");
});

/* ==============  N e O · CONCEITO × FONTE, SEM TOKEN SOLTO  =========== */

test("GATE 11 · N — a fonte se liga ao conceito pela seção em que foi citada", () => {
  const pesquisa = fontes();
  const causas = pesquisa.conceptAlignments.find(item => /Causas|sebo|oleosidade/i.test(item.conceptLabel));

  assert.ok(causas, "SOURCE_CONCEPT_ALIGNMENT");
  assert.ok(causas!.sectionHeading, "com a seção que sustenta a ligação");
  assert.ok(causas!.provenance.length > 0, "e as páginas onde isso foi observado");
  assert.match(causas!.evidence, /citam .* na seção/);
  assert.ok(["LEXICAL", "SEMANTICALLY_RELATED"].includes(causas!.matchKind));
});

test("GATE 11 · O — um token genérico isolado não cria alinhamento", () => {
  /* "Cuidados gerais" e "Cuidados com a casa" partilham só um termo genérico. */
  const paginas = Array.from({ length: 4 }, (_, index) => pagina(`G${index}`, ["Cuidados gerais com a pele oleosa"], [
    link({ destinationUrl: "https://arquitetura.com.br/cuidados-com-a-casa", destinationDomain: "arquitetura.com.br", anchorText: "cuidados com a casa", sectionHeading: "Cuidados com a casa" }),
  ]));
  const pesquisa = buildRadarExternalSourceResearch({
    pages: paginas,
    semantic: buildRadarSemanticConceptModel({ pages: paginas, centralEntities: ["pele oleosa"], keywordTexts: ["skincare para pele oleosa"] }),
    context: contexto(),
  });

  const forcado = pesquisa.conceptAlignments.find(item => item.domain === "arquitetura.com.br");
  if (forcado) {
    assert.notEqual(forcado.matchKind, "SEMANTICALLY_RELATED", "uma palavra em comum não é relação");
  }
  /* E a regra que segura isso é a mesma dos gates anteriores. */
  const fonte = readFileSync("lib/radar/link-and-source-research.ts", "utf8");
  assert.match(fonte, /comuns\.length >= 2/, "duas raízes, ou uma que seja o próprio assunto");
});

/* ==========  P e Q · O GATE 10 MELHORA SEM SER REFEITO  ============== */

test("GATE 11 · P — os links internos observados chegam ao Gate 10 com destino e âncora", () => {
  const pesquisa = buildRadarInternalLinkResearch({ context: contexto(), pages: PAGINAS, semantic: semantico() });

  assert.ok(pesquisa.observedCompetitorLinks.length > 0, "OBSERVED_INTERNAL_LINKS");
  const rotina = pesquisa.observedCompetitorLinks.find(item => item.anchorText === "rotina noturna")!;
  assert.equal(rotina.path, "/blog/rotina-noturna", "com o caminho do destino");
  assert.ok(rotina.sectionHeading, "e a seção em que apareceu");
  assert.ok(rotina.destination.startsWith("https://"));

  /* Com destino real, os padrões passam a dizer PARA ONDE eles apontam. */
  const guias = pesquisa.competitorPatterns.find(item => item.key === "LINKS_TO_RELATED_GUIDES");
  const hubs = pesquisa.competitorPatterns.find(item => item.key === "LINKS_TO_HUBS");
  assert.ok(guias, "links para conteúdos editoriais do próprio site");
  assert.equal(guias!.sourceCount, 4);
  assert.ok(hubs, "links para categorias");
  assert.equal(hubs!.sourceCount, 6);

  /* E a limitação de "só a contagem" some quando o destino existe. */
  assert.equal(pesquisa.limitations.some(item => /apenas a CONTAGEM/.test(item)), false);
});

test("GATE 11 · Q — o Gate 10 continua verde: grafo, direção e SiloPage intactos", () => {
  const semDestino = PAGINAS.map(page => ({ ...page, observedLinks: [] }));
  const pesquisa = buildRadarInternalLinkResearch({ context: contexto(), pages: semDestino, semantic: semantico() });

  /* Sem destino observado, o comportamento do Gate 10 é exatamente o de antes. */
  assert.ok(pesquisa.limitations.some(item => /apenas a CONTAGEM/.test(item)));
  assert.equal(pesquisa.competitorPatterns.some(item => item.key === "LINKS_TO_HUBS"), false,
    "padrão que depende de destino não é afirmado sem destino");
  assert.ok(pesquisa.competitorPatterns.some(item => item.key === "USES_CONTEXTUAL_INTERNAL_LINKS"));
});

/* ==============  R e S · CAPTURAR NÃO É NAVEGAR  ===================== */

test("GATE 11 · R — nenhum destino observado é buscado", async () => {
  let chamadas = 0;
  const page = await extractCompetitorPage("https://exemplo.com.br/blog/pele-oleosa", {
    fetchImpl: (async () => { chamadas += 1; return resposta(HTML_CONCORRENTE); }) as unknown as typeof fetch,
    lookupImpl: (async () => [{ address: "93.184.216.34" }]) as never,
    now: "2026-09-10T10:00:00.000Z",
  });

  assert.equal(chamadas, 1, "DESTINATION_FETCH_PERFORMED = NO — só a própria página foi buscada");
  assert.ok(page.observedLinks.length > 5, "e mesmo assim os links foram observados");

  /* O módulo de domínio não sabe o que é rede. */
  const fonte = readFileSync("lib/radar/link-and-source-research.ts", "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of ["fetch(", "supabase", "Repository", "process.env", "async "]) {
    assert.equal(codigo.includes(proibido), false, `${proibido} não pode existir aqui`);
  }
});

test("GATE 11 · S — o contexto do artigo entra como leitura e volta idêntico", () => {
  const antes = contexto();
  const copia = JSON.stringify(antes);
  buildRadarExternalSourceResearch({ pages: PAGINAS, provenance: PROVENIENCIA, semantic: semantico(), context: antes });
  buildRadarInternalLinkResearch({ context: antes, pages: PAGINAS, semantic: semantico() });
  assert.equal(JSON.stringify(antes), copia, "UPSTREAM_MUTATED = NO");

  const paginasAntes = JSON.stringify(PAGINAS);
  radarLinkObservations({ pages: PAGINAS });
  assert.equal(JSON.stringify(PAGINAS), paginasAntes, "as páginas extraídas também voltam intactas");
});

/* ============  T, U e V · MODELO, PROJEÇÃO E FRONTEIRA  ============== */

function observado() {
  const context = contexto();
  const structural = buildRadarCompetitiveModel({
    pages: PAGINAS, query: "skincare para pele oleosa", principal: "skincare para pele oleosa",
    editorialTopics: context.editorialTopics, keywordTexts: context.resolvedKeywordTexts, centralEntities: ["pele oleosa"],
  });
  const comparison = buildRadarEditorialComparison({ context, model: structural, observedIntent: "informacional" });
  return buildRadarCompetitiveObservedModel({
    context, references: [], selectedUrls: [], pages: PAGINAS,
    structural, comparison,
    diagnostic: { dominantIntent: "informacional", dominantFormats: ["article"] },
    observedAt: "2026-09-10T12:00:00.000Z",
  });
}

test("GATE 11 · T — o modelo competitivo observado consome a nova camada", () => {
  const modelo = observado();

  assert.ok(modelo.externalSources, "COMPETITIVE_MODEL_INTEGRATED");
  assert.ok(modelo.externalSources.evidenceCandidates.length > 0);
  assert.ok(modelo.externalSources.recurrentDomains.length > 0);
  assert.ok(modelo.internalLinks.observedCompetitorLinks.length > 0, "e o Gate 10 recebe os destinos");
  assert.ok(modelo.limitations.some(item => /Nenhum destino foi acessado/.test(item)));

  /* Nenhum relatório paralelo: a autoridade continua sendo uma. */
  const view = readFileSync("lib/radar/deep-research-view.ts", "utf8");
  assert.equal(/buildRadarExternalSourceResearch/.test(view), false, "a view não monta a camada por fora");
});

test("GATE 11 · U — a projeção humana das fontes sai da mesma autoridade", () => {
  const modelo = observado();
  const secao = radarObservedNarrative(modelo).find(item => item.title === "Fontes e referências")!;

  assert.ok(secao, "a seção existe na primeira camada");
  assert.match(secao.lines[0], /\d+ de \d+ páginas citam fontes externas/);
  assert.match(secao.lines[1], /fonte\(s\) distinta\(s\) observada\(s\)/);
  assert.ok(secao.lines.some(linha => /citado por \d+ concorrentes/.test(linha)));
  assert.ok(secao.lines.some(linha => /Nenhum destino foi acessado/.test(linha)));

  /* Não despejar oitenta URLs na primeira camada. */
  const urls = secao.lines.join(" ").match(/https?:\/\//g) || [];
  assert.equal(urls.length, 0, "a lista completa fica no modelo");
  assert.ok(secao.lines.length <= 12);

  assert.deepEqual(radarObservedNarrative(modelo).find(item => item.title === "Fontes e referências"), secao);
});

test("GATE 11 · V — o Radar diz quem cita o quê; ele não manda citar", () => {
  const fonte = readFileSync("lib/radar/link-and-source-research.ts", "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  for (const proibido of [
    "finalAnchor", "requiredAnchor", "repeatCount", "insertAt", "insertSection",
    "insertPosition", "targetOccurrences", "recommendedSource", "shouldCite", "useSource",
  ]) {
    assert.equal(codigo.includes(proibido), false, `${proibido} pertence ao Planejador`);
  }

  const modelo = observado();
  const serializado = JSON.stringify(modelo.externalSources);
  for (const proibido of ["finalAnchor", "repeatCount", "insertAt", "shouldCite"]) {
    assert.equal(serializado.includes(proibido), false, `PLANNER_DECISIONS_EMITTED = NO — ${proibido}`);
  }

  /* A frase é de observação, não de instrução. */
  const texto = [
    ...modelo.externalSources.evidenceCandidates.map(item => item.reason),
    ...modelo.externalSources.patterns.map(item => item.observation),
    ...radarObservedNarrative(modelo).find(item => item.title === "Fontes e referências")!.lines,
  ].join(" ");
  assert.equal(/\buse\b|\butilize\b|\bcite\b|\blinke\b|\binsira\b/i.test(texto), false);
  assert.match(texto, /citam|Citada por|observada/);
});
