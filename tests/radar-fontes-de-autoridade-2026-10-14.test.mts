import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  RADAR_AUTHORITY_LIMITS,
  RADAR_DEFAULT_AUTHORITY_DOMAINS,
  RadarAuthoritySourcesRecordSchema,
  radarAuthorityEntryFor,
  radarAuthoritySourcesUnavailable,
  radarDefaultAuthorityLines,
  radarEffectiveAuthorityList,
  radarParseAuthorityLines,
} from "../lib/radar/authority-sources-contract.ts";
import {
  buildRadarAuthorityCandidates,
  radarAuthorityMatchClaim,
  radarAuthoritySourcesView,
  radarCompetitorCitedSources,
  radarWikipediaArticleUrl,
} from "../lib/radar/authority-sources.ts";
import {
  RADAR_AUTHORITY_ROBOTS_TOKEN,
  radarAuthorityPageDate,
  radarAuthoritySourcesForAnalysis,
  radarRobotsAllows,
  verifyRadarAuthoritySources,
} from "../lib/radar/authority-source-verification.ts";
import { assessRadarClaimYmyl, type RadarEvidenceClaim } from "../lib/radar/claim-evidence.ts";
import { RadarAnalysisPayloadSchema } from "../lib/radar/analysis-contracts.ts";
import { RADAR_RESET_CLEARED } from "../lib/radar/radar-reset.ts";
import { RADAR_SERP_RAW_KINDS, radarSerpRawRows, radarSerpRawSourcesOf } from "../lib/radar/serp-raw-export.ts";
import { BrandDNASchema } from "../lib/arquiteto/contracts.ts";
import { createBrandDnaDraft } from "../lib/marca/domain.ts";
import { PLATFORM_OPERATIONS } from "../lib/agent/platform-catalog.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";

/*
 * ===== 2026-10-14 · FONTES EXTERNAS DE AUTORIDADE — FASE A (SDD silo interligado §16.2) =====
 *
 * Pedido do dono: links externos de autoridade no corpo dos artigos (Google, governo,
 * Ministério da Saúde, "pode ser sim também do https://pt.wikipedia.org/") — "pode
 * implementar". A Fase A coleta e confere; a aplicação no texto é a Fase B.
 *
 * Nenhum teste chama rede: `fetchImpl` e `lookupImpl` são stubs locais. Nenhuma
 * chamada paga, nenhuma IA.
 */

/* ============================== a fixture ============================== */

const link = (patch: Partial<RadarObservedLink>): RadarObservedLink => ({
  destinationUrl: "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/b/bruxismo",
  destinationDomain: "www.gov.br",
  kind: "EXTERNAL", anchorText: "Ministério da Saúde",
  surroundingText: "O bruxismo tem causas ligadas ao estresse.",
  sectionHeading: "Causas do bruxismo", rel: [], target: null, order: 0,
  ...patch,
});

const pagina = (id: string, links: RadarObservedLink[]): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://clinica-${id.toLowerCase()}.com.br/blog/bruxismo`, status: "success",
  fetchedAt: "2026-10-14T10:00:00.000Z", title: `Bruxismo ${id}`, metaDescription: "", canonical: null,
  h1: ["Bruxismo"], h2: ["Causas do bruxismo", "Tratamento do bruxismo na gravidez"], h3: [], wordCount: 1500,
  internalLinkCount: 0, externalLinkCount: links.filter(item => item.kind === "EXTERNAL").length,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 1, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: null, structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 1, italicCount: 0, paragraphCount: 10, paragraphWordCounts: [60],
  headingOutline: [{ level: 1, text: "Bruxismo" }, { level: 2, text: "Causas do bruxismo" }, { level: 2, text: "Tratamento do bruxismo na gravidez" }],
  introWordCount: 50, introText: "Abertura.", closingWordCount: 30, closingText: "Fecho.", hasClosing: true,
  emphasizedTerms: [], keywordPlacement: null, observedLinks: links, error: null,
});

const GOV = "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/b/bruxismo";
const WIKI = "https://pt.wikipedia.org/wiki/Bruxismo";
const PUBMED = "https://pubmed.ncbi.nlm.nih.gov/9999/";
const BLOG_RECORRENTE = "https://blog-de-dentista.com.br/bruxismo-guia";
const BLOG_SOLTO = "https://outro-blog.com.br/post";

const PAGINAS: RadarExtractionPage[] = [
  pagina("A", [link({}), link({ order: 1, destinationUrl: "https://www.instagram.com/clinica", destinationDomain: "www.instagram.com", anchorText: "Instagram", sectionHeading: null }), link({ order: 2, destinationUrl: BLOG_RECORRENTE, destinationDomain: "blog-de-dentista.com.br", anchorText: "guia completo" })]),
  pagina("B", [link({}), link({ order: 1, destinationUrl: WIKI, destinationDomain: "pt.wikipedia.org", anchorText: "Wikipédia", sectionHeading: "O que é bruxismo" }), link({ order: 2, destinationUrl: BLOG_RECORRENTE, destinationDomain: "blog-de-dentista.com.br", anchorText: "guia completo" })]),
  pagina("C", [link({ destinationUrl: PUBMED, destinationDomain: "pubmed.ncbi.nlm.nih.gov", anchorText: "estudo", sectionHeading: "Tratamento do bruxismo na gravidez" }), link({ order: 1, destinationUrl: BLOG_SOLTO, destinationDomain: "outro-blog.com.br", anchorText: "um post" })]),
];

const SERP = {
  organicResults: [{ url: "https://clinica-a.com.br/blog/bruxismo" }, { url: "https://www.cfo.org.br/noticias/bruxismo/" }],
  peopleAlsoAsk: [{ sourceUrl: "https://bvsms.saude.gov.br/bruxismo/" }, { sourceUrl: null }],
  knowledgeGraph: { sources: [{ url: WIKI }] },
  serpFeatures: { aiOverview: { references: [{ url: "https://www.scielo.br/j/abc/a/xyz/" }, { url: "https://loja.com.br/protetor" }] } },
};

function afirmacao(id: string, texto: string, dominios: string[] = []): RadarEvidenceClaim {
  const ymyl = assessRadarClaimYmyl({ text: texto });
  return {
    claimId: `claim:${id}`, canonicalClaim: texto, conceptId: `concept:${id}`, claimType: ymyl.claimType, ymyl,
    market: { competitors: 2, sampleSize: 3, recurrence: "MODERATE", queryCoverage: 1, supportingCompetitors: [], statement: "" },
    observedSourceDomains: dominios, confidence: "MEDIUM", provenance: "fixture",
  };
}

const CAUSAS = afirmacao("causas", "Causas do bruxismo", ["www.gov.br"]);
const GRAVIDEZ = afirmacao("gravidez", "Tratamento do bruxismo na gravidez", ["pubmed.ncbi.nlm.nih.gov"]);
const AFIRMACOES = [CAUSAS, GRAVIDEZ];

const html = (titulo: string, paragrafos: string[], extra = "") => `<!doctype html><html><head><title>${titulo}</title>${extra}</head><body><nav><p>Menu de navegação do site com muitos links e nada de conteúdo útil aqui.</p></nav>${paragrafos.map(item => `<p>${item}</p>`).join("")}</body></html>`;

const PAGINA_GOV = html("Bruxismo — Ministério da Saúde", [
  "O bruxismo é o hábito de ranger ou apertar os dentes, durante o dia ou durante o sono.",
  "Entre as causas do bruxismo estão o estresse, a ansiedade e alterações do sono; o diagnóstico é feito pelo dentista.",
], `<meta property="article:modified_time" content="2025-03-10T12:00:00-03:00">`);
const PAGINA_PUBMED = html("Bruxism treatment in pregnancy - PubMed", [
  "Neste estudo, o tratamento do bruxismo na gravidez priorizou placas oclusais e cuidados não medicamentosos, sem fármacos.",
]);
const PAGINA_WIKI = html("Bruxismo – Wikipédia, a enciclopédia livre", [
  "Bruxismo é a atividade parafuncional de apertar ou ranger os dentes, de origem multifatorial.",
]);

type Resposta = { status: number; body?: string; headers?: Record<string, string>; never?: boolean };

/** O fetch simulado: um mapa de URL → resposta; o resto é 404. Registra cada chamada. */
function fetchSimulado(mapa: Record<string, Resposta>) {
  const chamadas: Array<{ url: string; userAgent: string | null }> = [];
  const impl = (async (entrada: URL | string, init?: RequestInit) => {
    const url = String(entrada);
    chamadas.push({ url, userAgent: new Headers(init?.headers).get("user-agent") });
    const resposta = mapa[url];
    if (resposta?.never) {
      return await new Promise<Response>((_, rejeitar) => init?.signal?.addEventListener("abort", () => rejeitar(new Error("abortado"))));
    }
    if (!resposta) return new Response("não existe", { status: 404, headers: { "content-type": "text/plain" } });
    return new Response(resposta.body ?? "", { status: resposta.status, headers: { "content-type": "text/html; charset=utf-8", ...(resposta.headers || {}) } });
  }) as typeof fetch;
  return { impl, chamadas };
}

const lookupPublico = (async () => [{ address: "93.184.216.34", family: 4 }]) as never;

/* ============================== a lista ============================== */

test("§16.2 · a lista padrão sugerida tem governo, Ministério da Saúde, Anvisa, IBGE, conselhos, OMS, SciELO, PubMed, Wikipédia e Google", () => {
  const dominios = RADAR_DEFAULT_AUTHORITY_DOMAINS.map(item => `${item.domain}${item.pathPrefix || ""}`);
  for (const esperado of ["gov.br", "gov.br/saude", "saude.gov.br", "anvisa.gov.br", "ibge.gov.br", "cfo.org.br", "cfm.org.br", "who.int", "scielo.br", "pubmed.ncbi.nlm.nih.gov", "pt.wikipedia.org", "developers.google.com/search", "support.google.com"]) {
    assert.ok(dominios.includes(esperado), `${esperado} na lista padrão`);
  }
  const de = (url: string) => radarAuthorityEntryFor(url, RADAR_DEFAULT_AUTHORITY_DOMAINS);
  assert.equal(de(GOV)?.entity, "Ministério da Saúde", "o caminho /saude vence o gov.br genérico");
  assert.equal(de("https://www.gov.br/mec/pt-br")?.entity, "Governo Federal (gov.br)");
  assert.equal(de("https://website.cfo.org.br/codigo-de-etica/")?.entity, "Conselho Federal de Odontologia (CFO)");
  assert.equal(de(WIKI)?.kind, "enciclopedia");
  assert.equal(de("https://developers.google.com/search/docs/fundamentals")?.kind, "documentacao_google");
  assert.equal(de("https://developers.google.com/maps"), null, "fora do caminho /search não é a documentação de busca");
  assert.equal(de("https://gov.br.golpe.com/saude"), null, "domínio que só contém o nome não casa");
  assert.equal(radarDefaultAuthorityLines().length, RADAR_DEFAULT_AUTHORITY_DOMAINS.length);
});

test("§16.2 · a lista da Marca: um domínio por linha, nome opcional; linha inválida fica de fora e é dita; vazia = a sugerida", () => {
  const lida = radarParseAuthorityLines(["https://www.saude.gov.br/", "crosp.org.br | CRO-SP", "isto não é domínio", "saude.gov.br", "minhaassociacao.org.br"]);
  assert.deepEqual(lida.entries.map(item => [item.domain, item.entity, item.kind]), [
    ["saude.gov.br", "Ministério da Saúde", "governo"],
    ["crosp.org.br", "CRO-SP", "conselho"],
    ["minhaassociacao.org.br", "minhaassociacao.org.br", "lista_da_marca"],
  ]);
  assert.deepEqual(lida.invalid, ["isto não é domínio"]);
  assert.equal(radarEffectiveAuthorityList([]).origin, "padrao");
  assert.equal(radarEffectiveAuthorityList(["", "  "]).origin, "padrao");
  assert.equal(radarEffectiveAuthorityList(["cfo.org.br"]).origin, "marca");
});

test("§16.2 · a lista mora no BrandDNA (dado da Marca), opcional: a versão gravada antes continua válida e o rascunho sem lista é o de antes", () => {
  const base = { schemaVersion: 1 as const, brandId: "marca-1", positioning: "p", audience: ["a"], voice: ["v"], businessObjectives: ["o"], differentiators: [], prohibitedClaims: [], editorialPrinciples: [] };
  assert.equal(BrandDNASchema.safeParse(base).success, true, "sem o campo, válida");
  assert.deepEqual(BrandDNASchema.parse({ ...base, authoritySources: ["cfo.org.br"] }).authoritySources, ["cfo.org.br"]);
  assert.equal("authoritySources" in createBrandDnaDraft({ brandId: "marca-1" }), false, "o rascunho sem lista não ganha chave (hash de antes)");
  const painel = readFileSync("modules/marca/brand-dna-panel.tsx", "utf8");
  assert.match(painel, /Fontes de autoridade/);
  assert.match(painel, /Usar a lista sugerida/);
});

/* ============================== as candidatas ============================== */

test("§16.2 · candidatas: as citadas pelos concorrentes e as da SERP já coletada nos domínios da lista; nenhuma URL fora delas", () => {
  const candidatas = buildRadarAuthorityCandidates({ pages: PAGINAS, serp: { organic: SERP.organicResults, peopleAlsoAsk: SERP.peopleAlsoAsk, knowledgeGraphSources: SERP.knowledgeGraph.sources, aiOverview: SERP.serpFeatures.aiOverview.references }, list: RADAR_DEFAULT_AUTHORITY_DOMAINS, claims: AFIRMACOES });
  const urls = candidatas.map(item => item.url);
  const permitidas = new Set([
    ...PAGINAS.flatMap(item => item.observedLinks.map(link => link.destinationUrl)),
    ...SERP.organicResults.map(item => item.url), ...SERP.peopleAlsoAsk.map(item => item.sourceUrl).filter(Boolean), WIKI,
    ...SERP.serpFeatures.aiOverview.references.map(item => item.url),
  ]);
  for (const url of urls) assert.ok(permitidas.has(url), `${url} veio do que já foi coletado`);
  assert.ok(urls.includes(GOV) && urls.includes(WIKI) && urls.includes(PUBMED), "as da lista citadas pelos concorrentes");
  assert.ok(urls.includes("https://www.cfo.org.br/noticias/bruxismo/"), "orgânico da SERP num domínio da lista");
  assert.ok(urls.includes("https://bvsms.saude.gov.br/bruxismo/"), "fonte do 'Pessoas também perguntam'");
  assert.ok(urls.includes("https://www.scielo.br/j/abc/a/xyz/"), "fonte do resumo de IA");
  assert.ok(!urls.includes("https://clinica-a.com.br/blog/bruxismo"), "concorrente da SERP não é fonte");
  assert.ok(!urls.includes("https://loja.com.br/protetor"), "fora da lista, a SERP não entra");
  assert.ok(!urls.some(url => url.includes("instagram")), "rede social nunca");
  assert.ok(urls.includes(BLOG_RECORRENTE), "fora da lista, citado por 2 concorrentes: entra como mercado");
  assert.equal(candidatas.find(item => item.url === BLOG_RECORRENTE)?.kind, "mercado");
  assert.ok(!urls.includes(BLOG_SOLTO), "fora da lista, citado por 1 e sem natureza factual: fica de fora");
  /* A ordem: a da lista que sustenta afirmação de saúde primeiro; o mercado por último. */
  assert.equal(candidatas[0].url, PUBMED, "a fonte da afirmação YMYL (gravidez) abre a fila");
  assert.equal(candidatas.at(-1)?.kind, "mercado");
});

test("§16.2 · Wikipédia pela entidade central: só quando ela está na lista e nenhuma URL da Wikipédia foi coletada; pela regra fixa do site", () => {
  assert.equal(radarWikipediaArticleUrl("bruxismo"), WIKI);
  assert.equal(radarWikipediaArticleUrl("dor de cabeça tensional crônica forte"), null, "nome longo demais não vira verbete");
  const semWiki = PAGINAS.map(item => ({ ...item, observedLinks: item.observedLinks.filter(link => !link.destinationUrl.includes("wikipedia")) }));
  const comEntidade = buildRadarAuthorityCandidates({ pages: semWiki, list: RADAR_DEFAULT_AUTHORITY_DOMAINS, claims: AFIRMACOES, centralEntities: ["bruxismo"] });
  const verbete = comEntidade.find(item => item.origin === "entidade_wikipedia");
  assert.equal(verbete?.url, WIKI);
  assert.equal(verbete?.expectedEntity, "bruxismo");
  const semNaLista = buildRadarAuthorityCandidates({ pages: semWiki, list: radarParseAuthorityLines(["gov.br"]).entries, claims: AFIRMACOES, centralEntities: ["bruxismo"] });
  assert.equal(semNaLista.some(item => item.origin === "entidade_wikipedia"), false, "fora da lista da Marca, não monta verbete");
});

/* ============================== a conferência ============================== */

test("§16.2 · conferência com fetch simulado: ok, 404, redirecionamento para outro domínio, timeout e página que não sustenta", async () => {
  const candidatas = [
    { url: GOV, host: "www.gov.br", expectedDomain: "gov.br", entity: "Ministério da Saúde", kind: "governo" as const, origin: "concorrente" as const, citedByCompetitors: 2, claimIds: [CAUSAS.claimId], expectedEntity: null, priority: 1 },
    { url: PUBMED, host: "pubmed.ncbi.nlm.nih.gov", expectedDomain: "pubmed.ncbi.nlm.nih.gov", entity: "PubMed", kind: "cientifica" as const, origin: "concorrente" as const, citedByCompetitors: 1, claimIds: [GRAVIDEZ.claimId], expectedEntity: null, priority: 0 },
    { url: "https://www.anvisa.gov.br/sumiu", host: "anvisa.gov.br", expectedDomain: "anvisa.gov.br", entity: "Anvisa", kind: "governo" as const, origin: "resumo_ia" as const, citedByCompetitors: 0, claimIds: [], expectedEntity: null, priority: 2 },
    { url: "https://www.cfo.org.br/vai-embora", host: "cfo.org.br", expectedDomain: "cfo.org.br", entity: "CFO", kind: "conselho" as const, origin: "serp_organico" as const, citedByCompetitors: 0, claimIds: [], expectedEntity: null, priority: 3 },
    { url: "https://ibge.gov.br/lento", host: "ibge.gov.br", expectedDomain: "ibge.gov.br", entity: "IBGE", kind: "governo" as const, origin: "serp_organico" as const, citedByCompetitors: 0, claimIds: [], expectedEntity: null, priority: 3 },
    { url: "https://www.scielo.br/fora-do-tema", host: "scielo.br", expectedDomain: "scielo.br", entity: "SciELO", kind: "cientifica" as const, origin: "resumo_ia" as const, citedByCompetitors: 0, claimIds: [], expectedEntity: null, priority: 2 },
  ];
  const { impl, chamadas } = fetchSimulado({
    [GOV]: { status: 200, body: PAGINA_GOV },
    [PUBMED]: { status: 200, body: PAGINA_PUBMED },
    "https://www.cfo.org.br/vai-embora": { status: 301, headers: { location: "https://golpe.example.com/cfo" } },
    "https://ibge.gov.br/lento": { status: 200, never: true },
    "https://www.scielo.br/fora-do-tema": { status: 200, body: html("Outra coisa", ["Este artigo fala de economia agrícola e de safra de soja no cerrado brasileiro."]) },
  });
  const registro = await verifyRadarAuthoritySources({
    candidates: candidatas, claims: AFIRMACOES, centralEntities: ["bruxismo"],
    list: { origin: "padrao", brandDnaVersionId: null, domains: RADAR_DEFAULT_AUTHORITY_DOMAINS.length },
    fetchImpl: impl, lookupImpl: lookupPublico, now: "2026-10-14T12:00:00.000Z",
    limits: { pageTimeoutMs: 80, robotsTimeoutMs: 80 },
  });
  assert.equal(RadarAuthoritySourcesRecordSchema.safeParse(registro).success, true);
  assert.deepEqual(registro.verified.map(item => [item.id, item.url, item.entity, item.claim]), [
    ["X1", GOV, "Ministério da Saúde", "Causas do bruxismo"],
    ["X2", PUBMED, "PubMed", "Tratamento do bruxismo na gravidez"],
  ]);
  const gov = registro.verified[0];
  assert.match(gov.excerpt, /causas do bruxismo estão o estresse/);
  assert.equal(gov.publishedAt, "2025-03-10");
  assert.equal(gov.kind, "governo");
  assert.ok(gov.excerpt.length <= RADAR_AUTHORITY_LIMITS.excerptChars);
  const motivos = Object.fromEntries(registro.failures.map(item => [item.url, item.code]));
  assert.deepEqual(motivos, {
    "https://www.anvisa.gov.br/sumiu": "not_found",
    "https://www.cfo.org.br/vai-embora": "outro_dominio",
    "https://ibge.gov.br/lento": "timeout",
    "https://www.scielo.br/fora-do-tema": "nao_sustenta",
  });
  assert.match(registro.failures.find(item => item.code === "outro_dominio")!.reason, /golpe\.example\.com/);
  assert.equal(chamadas.some(item => item.url.includes("golpe.example.com")), false, "o outro domínio nunca é aberto");
  /* Nenhuma URL fora das candidatas (e do robots.txt de cada site delas). */
  const origens = new Set(candidatas.map(item => new URL(item.url).origin));
  for (const chamada of chamadas) {
    const endereco = new URL(chamada.url);
    assert.ok(candidatas.some(item => item.url === chamada.url) || (endereco.pathname === "/robots.txt" && origens.has(endereco.origin)), `${chamada.url} fora das candidatas`);
    assert.ok(chamada.userAgent?.startsWith(RADAR_AUTHORITY_ROBOTS_TOKEN), "user-agent identificado");
  }
  assert.equal(chamadas.filter(item => item.url.endsWith("/robots.txt")).length, origens.size, "um robots.txt por site");
  assert.deepEqual(registro.cost, { providerCalls: 0, aiCalls: 0, pageFetches: 6, robotsFetches: origens.size });
});

test("§16.2 · YMYL marcado: a afirmação de saúde exige fonte, a fonte que a sustenta sai marcada, e a que fica sem fonte aparece", async () => {
  const { impl } = fetchSimulado({ [PUBMED]: { status: 200, body: PAGINA_PUBMED } });
  const registro = await verifyRadarAuthoritySources({
    candidates: [{ url: PUBMED, host: "pubmed.ncbi.nlm.nih.gov", expectedDomain: "pubmed.ncbi.nlm.nih.gov", entity: "PubMed", kind: "cientifica", origin: "concorrente", citedByCompetitors: 1, claimIds: [], expectedEntity: null, priority: 0 }],
    claims: [...AFIRMACOES, afirmacao("dose", "Dosagem de relaxante muscular para bruxismo")],
    list: { origin: "padrao", brandDnaVersionId: null, domains: 1 }, fetchImpl: impl, lookupImpl: lookupPublico, now: "2026-10-14T12:00:00.000Z",
  });
  assert.equal(registro.verified[0].ymyl, true, "tratamento na gravidez é afirmação de saúde (YMYL)");
  const porAfirmacao = Object.fromEntries(registro.ymylClaims.map(item => [item.claim, item.sourceIds]));
  assert.deepEqual(porAfirmacao["Tratamento do bruxismo na gravidez"], ["X1"]);
  assert.deepEqual(porAfirmacao["Dosagem de relaxante muscular para bruxismo"], [], "a de dosagem segue sem fonte, e isso fica dito");
  assert.equal(porAfirmacao["Causas do bruxismo"], undefined, "causa sem domínio de decisão sensível não é YMYL");
  const vista = radarAuthoritySourcesView(registro);
  assert.deepEqual(vista.ymylPending, ["Dosagem de relaxante muscular para bruxismo"]);
});

test("§16.2 · robots.txt respeitado (a página não é aberta) e Wikipédia que não é a entidade recusada", async () => {
  assert.equal(radarRobotsAllows("User-agent: *\nDisallow: /privado/\nAllow: /privado/publico", "/privado/x"), false);
  assert.equal(radarRobotsAllows("User-agent: *\nDisallow: /privado/\nAllow: /privado/publico", "/privado/publico/a"), true);
  assert.equal(radarRobotsAllows(`User-agent: ${RADAR_AUTHORITY_ROBOTS_TOKEN}\nDisallow: /\n\nUser-agent: *\nAllow: /`, "/qualquer"), false, "o grupo do nosso robô vence o *");
  assert.equal(radarRobotsAllows("User-agent: *\nDisallow:", "/x"), true, "Disallow vazio permite");
  assert.equal(radarRobotsAllows("User-agent: *\nDisallow: /*.pdf$", "/a/b.pdf"), false);

  const { impl, chamadas } = fetchSimulado({
    "https://www.cfo.org.br/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /restrito/", headers: { "content-type": "text/plain" } },
    "https://www.cfo.org.br/restrito/bruxismo": { status: 200, body: PAGINA_GOV },
    "https://pt.wikipedia.org/wiki/Bruxismo_(desambigua%C3%A7%C3%A3o)": { status: 200, body: html("Bruxismo (desambiguação) – Wikipédia, a enciclopédia livre", ["Bruxismo pode referir-se a vários assuntos ligados ao bruxismo e aos dentes."]) },
    [WIKI]: { status: 200, body: PAGINA_WIKI },
  });
  const registro = await verifyRadarAuthoritySources({
    candidates: [
      { url: "https://www.cfo.org.br/restrito/bruxismo", host: "cfo.org.br", expectedDomain: "cfo.org.br", entity: "CFO", kind: "conselho", origin: "serp_organico", citedByCompetitors: 0, claimIds: [], expectedEntity: null, priority: 3 },
      { url: "https://pt.wikipedia.org/wiki/Bruxismo_(desambigua%C3%A7%C3%A3o)", host: "pt.wikipedia.org", expectedDomain: "pt.wikipedia.org", entity: "Wikipédia", kind: "enciclopedia", origin: "entidade_wikipedia", citedByCompetitors: 0, claimIds: [], expectedEntity: "bruxismo", priority: 4 },
      { url: WIKI, host: "pt.wikipedia.org", expectedDomain: "pt.wikipedia.org", entity: "Wikipédia", kind: "enciclopedia", origin: "entidade_wikipedia", citedByCompetitors: 0, claimIds: [], expectedEntity: "bruxismo", priority: 4 },
    ],
    claims: [], centralEntities: ["bruxismo"],
    list: { origin: "padrao", brandDnaVersionId: null, domains: 1 }, fetchImpl: impl, lookupImpl: lookupPublico, now: "2026-10-14T12:00:00.000Z",
  });
  assert.deepEqual(registro.failures.map(item => item.code), ["robots", "entidade_diferente"]);
  assert.equal(chamadas.some(item => item.url === "https://www.cfo.org.br/restrito/bruxismo"), false, "a página proibida no robots.txt não foi aberta");
  assert.equal(registro.verified.length, 1);
  assert.equal(registro.verified[0].claim, 'Definição e contexto de "bruxismo"', "o verbete sustenta a definição da entidade");
});

test("§16.2 · o teto por artigo: no máximo 8 abertas; as outras ficam como 'fora do teto', ditas", async () => {
  const candidatas = Array.from({ length: 11 }, (_, indice) => ({ url: `https://www.gov.br/saude/p${indice}`, host: "www.gov.br", expectedDomain: "gov.br", entity: "Ministério da Saúde", kind: "governo" as const, origin: "serp_organico" as const, citedByCompetitors: 0, claimIds: [], expectedEntity: null, priority: 3 }));
  const { impl, chamadas } = fetchSimulado({});
  const registro = await verifyRadarAuthoritySources({ candidates: candidatas, claims: AFIRMACOES, list: { origin: "padrao", brandDnaVersionId: null, domains: 1 }, fetchImpl: impl, lookupImpl: lookupPublico, now: "2026-10-14T12:00:00.000Z" });
  assert.equal(registro.checked, RADAR_AUTHORITY_LIMITS.maxSources);
  assert.equal(registro.notChecked, 3);
  assert.equal(chamadas.filter(item => !item.url.endsWith("/robots.txt")).length, RADAR_AUTHORITY_LIMITS.maxSources);
  assert.match(radarAuthoritySourcesView(registro).headline, /3 fora do teto de 8 por artigo/);
});

test("§16.2 · o núcleo da rota sobre o que está gravado: páginas da amostra + SERP do snapshot + lista; sem SERP, dito na nota", async () => {
  const { impl } = fetchSimulado({ [GOV]: { status: 200, body: PAGINA_GOV }, [WIKI]: { status: 200, body: PAGINA_WIKI } });
  const registro = await radarAuthoritySourcesForAnalysis({ pages: PAGINAS, research: null, brandLines: ["gov.br/saude | Ministério da Saúde", "pt.wikipedia.org"], brandDnaVersionId: "dna-v3", keywordTexts: ["bruxismo"], centralEntities: ["bruxismo"], fetchImpl: impl, lookupImpl: lookupPublico, now: "2026-10-14T12:00:00.000Z" });
  assert.equal(registro.status, "CHECKED");
  assert.deepEqual(registro.list, { origin: "marca", brandDnaVersionId: "dna-v3", domains: 2 });
  assert.ok(registro.verified.some(item => item.url === GOV));
  assert.ok(registro.notes.some(item => /SERP do snapshot desta análise não foi lida/.test(item)));
  assert.deepEqual([registro.cost.providerCalls, registro.cost.aiCalls], [0, 0]);
});

test("§16.2 · casamento afirmação ↔ trecho sem IA: raízes, não palavra solta", () => {
  const casado = radarAuthorityMatchClaim({ paragraphs: ["As causas do bruxismo incluem estresse e ansiedade."], claims: [{ claimId: "c1", claim: "Causas do bruxismo", ymyl: false, preferred: false }] });
  assert.equal(casado?.claimId, "c1");
  const solto = radarAuthorityMatchClaim({ paragraphs: ["O estresse do trabalho causa muitas coisas na vida moderna."], claims: [{ claimId: "c1", claim: "Causas do bruxismo noturno em adultos", ymyl: false, preferred: false }] });
  assert.equal(solto, null);
  assert.equal(radarAuthorityPageDate('<script type="application/ld+json">{"dateModified":"2024-05-01"}</script>'), "2024-05-01");
});

/* ============================== a gravação e a leitura ============================== */

test("§16.2 · gravado na versão da análise (campo aditivo); o reset limpa; a análise antiga sem o campo continua válida", () => {
  const registro = radarAuthoritySourcesUnavailable("o servidor respondeu 503", "2026-10-14T12:00:00.000Z");
  assert.equal(RadarAnalysisPayloadSchema.shape.authoritySources.safeParse(registro).success, true);
  assert.equal(RadarAnalysisPayloadSchema.shape.authoritySources.safeParse(undefined).success, true, "análise gravada antes: sem o campo");
  assert.ok((RADAR_RESET_CLEARED as readonly string[]).includes("authoritySources"));
  const vista = radarAuthoritySourcesView(registro);
  assert.equal(vista.state, "UNAVAILABLE");
  assert.match(vista.headline, /não foram conferidas nesta rodada: o servidor respondeu 503/);
  assert.equal(radarAuthoritySourcesView(null).state, "ABSENT");
});

test("§16.2 · SERP crua: 'Fontes citadas pelos concorrentes' e 'Fontes verificadas' (url, entidade, trecho); sem a chave, o arquivo de antes", async () => {
  const { impl } = fetchSimulado({ [GOV]: { status: 200, body: PAGINA_GOV } });
  const registro = await verifyRadarAuthoritySources({
    candidates: [
      { url: GOV, host: "www.gov.br", expectedDomain: "gov.br", entity: "Ministério da Saúde", kind: "governo", origin: "concorrente", citedByCompetitors: 2, claimIds: [], expectedEntity: null, priority: 1 },
      { url: "https://www.anvisa.gov.br/sumiu", host: "anvisa.gov.br", expectedDomain: "anvisa.gov.br", entity: "Anvisa", kind: "governo", origin: "resumo_ia", citedByCompetitors: 0, claimIds: [], expectedEntity: null, priority: 2 },
    ],
    claims: AFIRMACOES, list: { origin: "padrao", brandDnaVersionId: null, domains: 1 }, fetchImpl: impl, lookupImpl: lookupPublico, now: "2026-10-14T12:00:00.000Z",
  });
  const base = { article: { principalKeyword: "bruxismo" }, serpObserved: null };
  const antes = radarSerpRawRows(base);
  assert.equal(antes.some(item => ([RADAR_SERP_RAW_KINDS.citedSource, RADAR_SERP_RAW_KINDS.verifiedSource] as string[]).includes(item.tipo)), false, "sem a chave, o arquivo de antes");
  const linhas = radarSerpRawRows({ ...base, sources: radarSerpRawSourcesOf({ extractions: PAGINAS, authoritySources: registro }) });
  const citadas = linhas.filter(item => item.tipo === RADAR_SERP_RAW_KINDS.citedSource);
  assert.ok(citadas.some(item => item.url === GOV && item.titulo === "Ministério da Saúde" && /citada por 2 página/.test(item.sinais)));
  const verificada = linhas.find(item => item.tipo === RADAR_SERP_RAW_KINDS.verifiedSource);
  assert.equal(verificada?.posicao, "X1");
  assert.match(verificada!.titulo, /^Ministério da Saúde — /);
  assert.match(verificada!.descricao, /causas do bruxismo/);
  assert.match(verificada!.sinais, /sustenta: Causas do bruxismo/);
  const naoConferida = linhas.find(item => item.tipo === RADAR_SERP_RAW_KINDS.unverifiedSource);
  assert.equal(naoConferida?.descricao, "a página não existe (404)");
  for (const linha of linhas) assert.ok(linha.descricao.length <= 300 || linha.tipo === RADAR_SERP_RAW_KINDS.about);
  assert.equal(radarCompetitorCitedSources(PAGINAS).some(item => item.url.includes("instagram")), false);
});

/* ============================== a estrutura ============================== */

const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("§16.2 · na MESMA operação do ANALYZE (e do lote, que usa o mesmo handler); a rota não aceita URL do cliente", () => {
  const pagina = semComentarios(readFileSync("modules/radar/radar-page.tsx", "utf8"));
  const analyze = pagina.slice(pagina.indexOf("const analyzeSerpSelection = async"), pagina.indexOf("const reviewSerpForArticle = async"));
  assert.match(analyze, /radar-analysis\/authority-sources", \{/, "a conferência roda no ANALYZE");
  assert.equal(pagina.split("radar-analysis/authority-sources\", {").length - 1, 1, "um ponto de chamada só");
  assert.match(analyze, /authoritySources: fontesDeAutoridade/, "o resultado vai para a versão final da análise");
  for (const bloco of pagina.split("useEffect(")) assert.equal(/authority-sources/.test(bloco.slice(0, 1200)), false, "nenhum efeito de montagem confere fonte");

  const rota = semComentarios(readFileSync("app/api/editorial/radar-analysis/authority-sources/route.ts", "utf8"));
  assert.match(rota, /\.strict\(\)/);
  assert.equal(/\burl\s*:/.test(rota.slice(rota.indexOf("const RequestSchema"), rota.indexOf("}).strict()"))), false, "sem campo de URL no pedido");
  assert.match(rota, /radarAuthoritySourcesForAnalysis\(/);
  assert.match(rota, /persistida\.payload\.extractions/, "as candidatas saem do que está gravado");
  assert.match(rota, /assertEditorialPermission\(profile, input\.brandId, "radar", "edit"\)/);

  const verificacao = semComentarios(readFileSync("lib/radar/authority-source-verification.ts", "utf8"));
  assert.match(verificacao, /fetchGuardedExternalResponse/, "as guardas da extração, não uma segunda implementação");
  assert.equal(/globalThis\.fetch|\bfetch\(/.test(verificacao), false, "nenhum caminho de rede próprio");
});

/*
 * 2026-10-14c · SDD silo interligado · F-B · decisão do dono (autorização do §16.2):
 * a Fase B leva as fontes conferidas ao artigo-modelo e ao CSV de escrita, pela
 * régua única `authority-sources-writing.ts` (provas em
 * `tests/radar-fontes-no-texto-f-b-2026-10-14.test.mts`). Continua valendo que a
 * escrita só LÊ o registro congelado no pacote: nenhum dos arquivos de escrita abre
 * página, chama a conferência ou grava fonte; e a voz humana e o material do MCP
 * (que monta pelo núcleo do export) não leem o registro por conta própria.
 */
test("§16.2 · Fase B: a escrita só lê o registro congelado (pela régua única); nenhum arquivo de escrita confere fonte nem abre página", () => {
  for (const arquivo of ["lib/radar/article-blueprint.ts", "lib/radar/portable-writing-export.ts", "lib/radar/portable-writing-batch.ts", "lib/radar/authority-sources-writing.ts"]) {
    const codigo = semComentarios(readFileSync(arquivo, "utf8"));
    assert.equal(/verifyRadarAuthoritySources|radarAuthoritySourcesForAnalysis|authority-source-verification|\bfetch\(/.test(codigo), false, `${arquivo} não confere fonte nem abre página`);
  }
  for (const arquivo of ["lib/radar/human-voice-guideline.ts", "lib/server/radar-mcp-material.ts"]) {
    assert.equal(/authoritySources|authority-sources/.test(semComentarios(readFileSync(arquivo, "utf8"))), false, `${arquivo} não lê o registro por conta própria`);
  }
  assert.match(semComentarios(readFileSync("lib/radar/portable-writing-export.ts", "utf8")), /radarAuthorityWritingOf\(input\.authoritySources/, "o CSV lê o registro do pacote pela régua única");
});

test("§16.2 · catálogo (AGENTS §17.1): a rota no Radar e a nota da conferência; a SERP crua diz as seções novas", () => {
  const investigar = PLATFORM_OPERATIONS.find(item => item.id === "radar.investigate")!;
  assert.ok(investigar.routes.includes("/api/editorial/radar-analysis/authority-sources"));
  const texto = JSON.stringify(PLATFORM_OPERATIONS);
  assert.ok(texto.includes("Fontes externas de autoridade"), "a nota da conferência no Radar");
  assert.ok(texto.includes("Fontes de autoridade (2026-10-14"), "a nota da lista na Marca");
  assert.ok(texto.includes("Fontes na SERP crua"), "a nota da SERP crua");
  const ferramenta = readFileSync("lib/server/platform-mcp-tools.ts", "utf8");
  assert.match(ferramenta.slice(ferramenta.indexOf("\"get_article_serp_raw\""), ferramenta.indexOf("\"get_article_serp_raw\"") + 2500), /fontes citadas pelos concorrentes/i);
});
