import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_NATURAL_ANCHOR_PROMPT_RULE,
  RADAR_NATURAL_ANCHOR_RULE,
  radarAnchorCuts,
  radarAnchorGraphConcepts,
  radarAnchorRepeatsKeyword,
  radarNaturalAnchor,
  type RadarAnchorLedger,
} from "../lib/radar/natural-anchor.ts";
import {
  RADAR_PUBLICATION_NO_SILO,
  radarPublicationIdentity,
  radarPublicationIdentityLines,
  radarSiloBaseFromPublished,
  radarSiloPublicationIdentities,
} from "../lib/radar/publication-identity.ts";
import {
  RADAR_ARTICLE_BLUEPRINT_RULES_VERSION,
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarArticleBlueprintNaturalAnchors,
  radarArticleBlueprintPayloadReading,
  radarArticleBlueprintPendingNotes,
  radarArticleBlueprintPrompt,
  radarArticleBlueprintRulesNoticeText,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintPayload,
} from "../lib/radar/article-blueprint.ts";
import {
  RADAR_WRITING_EXPORT_COLUMNS,
  RADAR_WRITING_GENERAL_RULES,
  buildRadarWritingExportArticle,
  buildRadarWritingTopRow,
  radarWritingExportCsv,
  type RadarWritingArticleContext,
  type RadarWritingExportRow,
  type RadarWritingPublication,
} from "../lib/radar/portable-writing-export.ts";
import { buildRadarVideoExportArticle } from "../lib/radar/portable-video-export.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import type { RadarSiloExportWritingContext } from "../lib/radar/portable-silo-export.ts";
import { WRITER_BLUEPRINT_READING_RULES, writerArticleBlueprintForWriting } from "../lib/redator/writer-blueprint-for-writing.ts";
import { ARTIGO, entradaGoogle } from "./radar-portable-writing-fixtures.mts";
import { respostaDaPlanta } from "./radar-piloto-planta-fixtures-2026-10-09.mts";

/*
 * ===== 2026-10-11 · A ÂNCORA NATURAL E A IDENTIDADE DE PUBLICAÇÃO (caso real "como atrair um cliente") =====
 *
 * O CSV real "artigo-como-atrair-um-cliente-para-escrever.csv" (11/10) levava a
 * keyword principal INTEIRA de cada destino como âncora ("tráfego pago vs
 * orgânico para clínica de estética", "campanhas de marketing para clínica de
 * estética sem anúncios"), e o texto saiu assim; a ordem narrativa mostrava só
 * "/qualificados" e "/como-captar-um-cliente" com "fora do arquivo (fora desta
 * seleção)"; o destino novo saía "/como-captar-um-cliente (planejado…)", sem o
 * caminho do Silo; e o artigo novo não dizia o canonical.
 *
 * As fixtures imitam o arquivo real: o Silo "Leads sem Tráfego Pago" com os 8
 * artigos (5 publicados em https://adalbapro.com.br/leads-sem-trafego-pago/<slug>,
 * o Pilar e "como captar um cliente" novos, e este artigo novo), a SiloPage
 * nova, a planta gravada com as 9 âncoras do CSV real e o grafo aprovado com os
 * conceitos de âncora lidos no banco (só leitura). Sem rede, sem IA, sem banco.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* D10 (entregável sai concluído) e as esperas antigas que o dono tirou. */
const D10 = [
  /\bpend[eê]ncia/i, /aguardando aprova/i, /rascunho/i, /fonte a obter/i, /\bpreencher\b/i, /pe[cç]a ao Arquiteto/i,
  /confira se a coleta traz/i, /conferir antes/i, /\ba definir\b/i,
];
const semD10 = (texto: string, onde: string) => {
  for (const proibida of D10) assert.doesNotMatch(texto.replace(/“[^”]*”/g, "“…”"), proibida, `${onde}: ${proibida}`);
};

/* ============================== o Silo real ============================== */

const SITE = "https://adalbapro.com.br";
const PREFIXO = `${SITE}/leads-sem-trafego-pago`;
const membro = (articleId: string, position: number, principal: string, slug: string, role = "Suporte") =>
  ({ articleId, position, title: principal, principalKeyword: principal, slug, role, statusLabel: "fora desta seleção", inThisFile: false, reason: null });
const SILO = (): RadarSiloExportWritingContext => ({
  kind: "silo", label: "Leads sem Tráfego Pago", partial: true, draft: false, centralEntity: "Leads sem Tráfego Pago",
  objective: "Construir autoridade em leads sem tráfego pago.", audience: null, macroProblem: null, dominantIntent: null, whyTogether: null,
  boundary: "Manter a cobertura centrada em leads sem tráfego pago e revisar sobreposições antes da publicação.",
  includedTopics: ["Leads sem Tráfego Pago", "como atrair um cliente"], excludedTopics: [],
  siloPage: { slug: "leads-sem-trafego-pago", canonical: PREFIXO, publishedUrl: null, status: "nova, ainda não publicada" },
  members: [
    membro("pilar-leads", 1, "leads qualificados", "qualificados", "Pilar"),
    membro("sup-instagram", 2, "instagram não traz pacientes", "instagram-nao-traz-pacientes"),
    membro("sup-captacao", 3, "captação de pacientes sem tráfego pago", "captacao-de-pacientes-sem-trafego-pago"),
    membro("sup-promocoes", 4, "promoções para estética", "promocoes-para-estetica"),
    membro("sup-captar", 5, "como captar um cliente", "como-captar-um-cliente"),
    membro("sup-trafego", 6, "tráfego pago vs orgânico para clínica de estética", "trafego-pago-vs-organico-para-clinica-de-estetica"),
    membro("sup-campanhas", 7, "campanhas de marketing para clínica de estética sem anúncios", "campanhas-de-marketing-para-clinica-de-estetica-sem-anuncios"),
    { ...membro(ARTIGO, 8, "como atrair um cliente", "como-atrair-um-cliente"), statusLabel: "finalizado", inThisFile: true },
  ],
} as RadarSiloExportWritingContext);

const publicado = (slug: string): RadarWritingPublication => ({ published: true, publishedUrl: `${PREFIXO}/${slug}`, canonical: `${PREFIXO}/${slug}`, slug, principalPolicy: "revisable" });
const novo = (slug: string): RadarWritingPublication => ({ published: false, publishedUrl: null, canonical: null, slug, principalPolicy: null });
const PUBLICACOES = (): Map<string, RadarWritingPublication> => new Map([
  ["pilar-leads", novo("qualificados")],
  ["sup-instagram", publicado("instagram-nao-traz-pacientes")],
  ["sup-captacao", publicado("captacao-de-pacientes-sem-trafego-pago")],
  ["sup-promocoes", publicado("promocoes-para-estetica")],
  ["sup-captar", novo("como-captar-um-cliente")],
  ["sup-trafego", publicado("trafego-pago-vs-organico-para-clinica-de-estetica")],
  ["sup-campanhas", publicado("campanhas-de-marketing-para-clinica-de-estetica-sem-anuncios")],
  [ARTIGO, novo("como-atrair-um-cliente")],
]);

/* O grafo aprovado do Silo, como lido no banco: só o link do Pilar sai deste artigo; os outros dois chegam a ele. */
const ARESTAS = [
  { sourceNodeId: `article:${ARTIGO}`, targetNodeId: "article:pilar-leads", relationType: "SUPPORT_TO_PILLAR", anchorConcepts: ["como gerar leads qualificados", "leads qualificados"], reason: "Suporte devolve ao Pilar.", priority: "high", direction: "outbound" as const },
  { sourceNodeId: "article:pilar-leads", targetNodeId: `article:${ARTIGO}`, relationType: "PILLAR_TO_SUPPORT", anchorConcepts: ["como atrair mais clientes", "como conquistar novos clientes", "táticas para conseguir clientes"], reason: "Pilar distribui.", priority: "high", direction: "inbound" as const },
  { sourceNodeId: "silo-page:silo-leads", targetNodeId: `article:${ARTIGO}`, relationType: "SILO_PAGE_TO_ARTICLE", anchorConcepts: ["atrair clientes sem anúncios pagos", "como conquistar clientes"], reason: "SiloPage distribui.", priority: "medium", direction: "inbound" as const },
];

const COMPLEMENTARES = ["como conquistar novos clientes", "como ganhar um cliente", "como conseguir mais clientes", "como atrair mais clientes", "como conquistar clientes"];

function entrada(): RadarPortableExportInput {
  const base = entradaGoogle();
  return {
    ...base,
    article: {
      ...base.article, principalKeyword: "como atrair um cliente", secondaryKeywords: COMPLEMENTARES, narrativeReinforcements: [], mustCover: [],
      slug: "como-atrair-um-cliente", canonical: null, siloName: "Leads sem Tráfego Pago", articleRole: "support", publishedProtected: false,
      audience: "Profissionais de clínicas de estética e saúde que buscam atrair clientes sem depender de tráfego pago.", promise: null,
    },
    researchContext: {
      ...base.researchContext!,
      silo: { siloId: "silo-leads", siloName: "Leads sem Tráfego Pago", articleRole: "support", siloDnaVersionId: null, siloPageSlug: "leads-sem-trafego-pago", siloPageCanonical: PREFIXO, siloPagePublicationStatus: "new" },
      internalLinks: { graphId: "grafo-leads", graphVersionId: "grafo-leads-v1", graphContentHash: "sha256:grafo", edges: ARESTAS },
    } as never,
    authors: [{ name: "Adalberto Escalante", specialty: null, source: "contribution" }],
  };
}

/* ============================== a planta gravada do CSV real ============================== */

type Secao = RadarArticleBlueprintPayload["blueprint"]["sections"][number];
const secao = (h2: string, links: Array<[string, string]>): Secao => ({
  h2, readerQuestion: `${h2.replace(/\?$/, "")}?`, answerFirst: "Resposta direta.", from: [], h3: [], explain: [], paragraphs: 3, bold: [], terms: [], evidence: [],
  specialist: null, video: null, internalLinks: links.map(([candidate, anchor]) => ({ candidate, anchor, reason: "Aprofunda o tema." })), externalLinks: [], image: null, practical: null,
} as Secao);

/* Os candidatos como a planta de 09/10 os gravou: sem conceitos de âncora e sem URL canônica (versão anterior). */
const CANDIDATOS = (): RadarArticleBlueprintPayload["linkCandidates"] => [
  { id: "K1", label: "leads qualificados", role: "Pilar", destination: "/qualificados", status: "PLANNED", fromGraph: true },
  { id: "K2", label: "instagram não traz pacientes", role: "Suporte", destination: `${PREFIXO}/instagram-nao-traz-pacientes`, status: "PUBLISHED", fromGraph: false },
  { id: "K3", label: "captação de pacientes sem tráfego pago", role: "Suporte", destination: `${PREFIXO}/captacao-de-pacientes-sem-trafego-pago`, status: "PUBLISHED", fromGraph: false },
  { id: "K4", label: "promoções para estética", role: "Suporte", destination: `${PREFIXO}/promocoes-para-estetica`, status: "PUBLISHED", fromGraph: false },
  { id: "K5", label: "como captar um cliente", role: "Suporte", destination: "/como-captar-um-cliente", status: "PLANNED", fromGraph: false },
  { id: "K6", label: "tráfego pago vs orgânico para clínica de estética", role: "Suporte", destination: `${PREFIXO}/trafego-pago-vs-organico-para-clinica-de-estetica`, status: "PUBLISHED", fromGraph: false },
  { id: "K7", label: "campanhas de marketing para clínica de estética sem anúncios", role: "Suporte", destination: `${PREFIXO}/campanhas-de-marketing-para-clinica-de-estetica-sem-anuncios`, status: "PUBLISHED", fromGraph: false },
  { id: "K8", label: "Página da marca /servicos/seo-para-clinicas", role: "Página da marca (Skill de voz)", destination: `${SITE}/servicos/seo-para-clinicas`, status: "PUBLISHED", fromGraph: false },
  { id: "K9", label: "SiloPage \"Leads sem Tráfego Pago\"", role: "SiloPage", destination: PREFIXO, status: "PLANNED", fromGraph: false },
];

/* As 9 âncoras do CSV real: 8 são a keyword inteira (ou a contêm), a da página da marca é o trecho do CTA. */
function plantaGravada(): RadarArticleBlueprintPayload {
  const secoes = [
    secao("Como atrair clientes no dia a dia?", [["K9", "Leads sem Tráfego Pago"]]),
    secao("Como conquistar novos clientes com abordagem e relacionamento?", [["K5", "como captar um cliente"]]),
    secao("Como conseguir mais clientes com canais e presença?", [["K2", "Instagram não traz pacientes"], ["K3", "captação de pacientes sem tráfego pago"]]),
    secao("Como conquistar clientes com experiência e fidelização?", [["K4", "promoções para estética"]]),
    secao("O que considerar antes de atrair novos clientes?", [["K1", "como gerar leads qualificados"]]),
    secao("Como a presença orgânica complementa a atração de clientes?", [["K6", "tráfego pago vs orgânico para clínica de estética"], ["K7", "campanhas de marketing para clínica de estética sem anúncios"]]),
    secao("Como colocar em prática um plano para atrair clientes?", [["K8", "serviços de SEO para clínicas"]]),
  ];
  return {
    schemaVersion: 1,
    rulesVersion: "2026-10-09b",
    blueprint: {
      keywordPlan: { reading: "A principal abre o artigo.", principalPlacement: ["H1", "primeiro parágrafo"], complementary: [], slugNote: null },
      reader: "Profissionais de clínicas de estética e saúde que buscam atrair clientes sem depender de tráfego pago.",
      promise: "Ao final, o leitor terá um caminho prático para atrair clientes no dia a dia.",
      angle: { statement: "Um roteiro de diagnóstico e ação com exemplos comentados.", evidence: [] },
      title: { h1: "Como atrair um cliente: o caminho prático para conquistar e fidelizar", alternatives: [], seoTitle: "Como atrair um cliente: guia prático para clínicas", metaDescription: "Descubra como atrair um cliente com estratégias práticas." },
      opening: { readerQuestion: "Como atrair um cliente para minha clínica sem depender de anúncios pagos?", direction: "Responder no primeiro parágrafo.", evidence: [] },
      sections: secoes,
      closing: { turn: "Atrair clientes é presença consistente.", specialist: null, cta: "Vamos conversar sobre como apresentar sua clínica? Conheça os serviços de SEO para clínicas.", nextStep: null },
      visual: [],
      eeat: ["Adalberto Escalante assina o artigo."],
      warnings: [],
    } as unknown as RadarArticleBlueprintPayload["blueprint"],
    measures: {
      serp: { comparablePages: 23, words: { median: 2869, p25: 2134, p75: 3139 }, h2: 9, h3: 18, paragraphs: 68, images: 23, lists: 4 },
      plan: { sections: secoes.length, h3: 0, paragraphs: 21, bold: 0, images: 0, respites: 0, internalLinks: 9, externalLinks: 0, wordsMin: 2134, wordsMax: 3139 },
    },
    linkCandidates: CANDIDATOS(),
    sources: [],
    evidence: [],
    skeleton: [],
  } as RadarArticleBlueprintPayload;
}

const contexto = (extra: Partial<RadarWritingArticleContext> = {}): RadarWritingArticleContext => ({
  topRowLabel: "Silo", filePosition: 1, silo: SILO(), articleId: ARTIGO, publication: novo("como-atrair-um-cliente"),
  siloPublications: PUBLICACOES(), blueprint: plantaGravada(), ...extra,
});
const linhaDoArtigo = (extra: Partial<RadarWritingArticleContext> = {}) => buildRadarWritingExportArticle(entrada(), contexto(extra));
const linhasDe = (texto: string) => texto.split("\n");
/* "L3 · âncora sugerida "x" → …" → { L, ancora, destino } */
const linksDe = (coluna: string) => linhasDe(coluna).filter(item => /^L\d+ · /.test(item)).map(item => {
  const lido = item.match(/^L(\d+) · âncora sugerida "([^"]+)"(?: · outras formulações: [^→]+)? → (.+?) · onde: /);
  assert.ok(lido, item);
  return { numero: Number(lido[1]), ancora: lido[2], destino: lido[3], linha: item };
});
const tudoDaLinha = (row: RadarWritingExportRow) => RADAR_WRITING_EXPORT_COLUMNS.map(coluna => row[coluna]).join("\n");

/* ============================== 1 · a régua da âncora ============================== */

test("régua · as 6 âncoras do caso real viram um recorte natural, nunca a keyword inteira do destino", () => {
  const caso = (anchor: string, targetLabel: string, graphConcepts: string[] = []) => radarNaturalAnchor({ anchor, targetLabel, graphConcepts });
  assert.equal(caso("tráfego pago vs orgânico para clínica de estética", "tráfego pago vs orgânico para clínica de estética").anchor, "tráfego pago vs orgânico");
  assert.equal(caso("promoções para estética", "promoções para estética").anchor, "promoções");
  assert.equal(caso("como captar um cliente", "como captar um cliente").anchor, "captar um cliente");
  /* O Pilar "leads qualificados", com os conceitos do grafo aprovado: um conceito que não é a keyword inteira (recortado do interrogativo). */
  const pilar = caso("como gerar leads qualificados", "leads qualificados", ["como gerar leads qualificados", "leads qualificados"]);
  assert.equal(pilar.anchor, "gerar leads qualificados");
  assert.equal(pilar.changed, true);
  assert.equal(pilar.reason, "keyword");
  const campanhas = caso("campanhas de marketing para clínica de estética sem anúncios", "campanhas de marketing para clínica de estética sem anúncios").anchor;
  assert.equal(campanhas, "campanhas de marketing sem anúncios");
  assert.doesNotMatch(campanhas, /para cl[ií]nica de est[eé]tica/);
  /* A SiloPage: um trecho natural do nome, nunca o nome inteiro do Silo. */
  const siloPage = caso("Leads sem Tráfego Pago", "SiloPage \"Leads sem Tráfego Pago\"").anchor;
  assert.equal(siloPage, "sem tráfego pago");
  assert.equal(radarAnchorRepeatsKeyword(siloPage, ["Leads sem Tráfego Pago"]), false);
  /* E as outras do arquivo real. */
  assert.equal(caso("Instagram não traz pacientes", "instagram não traz pacientes").anchor, "instagram");
  assert.equal(caso("captação de pacientes sem tráfego pago", "captação de pacientes sem tráfego pago").anchor, "captação de pacientes");
});

test("régua · a comparação ignora acento, caixa e plural; a âncora natural fica; a que contém a keyword inteira só com 4 palavras ou mais", () => {
  assert.equal(radarAnchorRepeatsKeyword("Promoção para Estética", ["promoções para estética"]), true, "singular e plural");
  assert.equal(radarAnchorRepeatsKeyword("COMO CAPTAR UNS CLIENTES", ["como captar um cliente"]), false, "outra frase não é a keyword");
  assert.equal(radarAnchorRepeatsKeyword("gerar leads qualificados", ["leads qualificados"]), false, "contém, mas com 3 palavras");
  assert.equal(radarAnchorRepeatsKeyword("como gerar leads qualificados", ["leads qualificados"]), true, "contém com 4 palavras");
  const natural = radarNaturalAnchor({ anchor: "serviços de SEO para clínicas", targetLabel: "Página da marca /servicos/seo-para-clinicas" });
  assert.deepEqual([natural.anchor, natural.changed], ["serviços de SEO para clínicas", false]);
  assert.deepEqual(radarAnchorCuts("como captar um cliente"), ["captar um cliente", "como captar"]);
});

test("régua · os conceitos do grafo são só os das arestas de SAÍDA (os de entrada descrevem este artigo)", () => {
  const grafo = radarAnchorGraphConcepts(ARESTAS);
  assert.deepEqual(grafo.byArticleId.get("pilar-leads"), ["como gerar leads qualificados", "leads qualificados"]);
  assert.deepEqual(grafo.siloPage, [], "o grafo não pede link deste artigo para a SiloPage");
  assert.equal([...grafo.byArticleId.values()].flat().some(conceito => /táticas para conseguir clientes|atrair clientes sem anúncios/.test(conceito)), false);
  /* Com conceitos de sobra, as outras formulações aparecem (sem a keyword inteira, na forma natural). */
  const lida = radarNaturalAnchor({ anchor: "Leads sem Tráfego Pago", targetLabel: "Leads sem Tráfego Pago", graphConcepts: ["leads sem anúncio pago", "Leads sem Tráfego Pago", "como conseguir contatos sem anúncios", "como captar leads sem tráfego pago"] });
  assert.equal(lida.anchor, "leads sem anúncio pago");
  /* O conceito que é a keyword inteira sai; o que a contém com 4 palavras ou mais, mesmo recortado, também; o natural fica como o Arquiteto o escreveu. */
  assert.deepEqual(lida.alternatives, ["como conseguir contatos sem anúncios"]);
});

test("variedade · na planta, a mesma âncora não se repete para o mesmo destino nem leva a dois destinos; o link repetido recebe a mesma troca", () => {
  const candidatos = CANDIDATOS();
  const secoes = [
    secao("Primeira", [["K1", "leads qualificados"]]),
    secao("Segunda", [["K1", "como gerar leads qualificados"]]),
    secao("Terceira", [["K5", "como captar um cliente"], ["K5", "como captar um cliente"]]),
  ];
  const lida = radarArticleBlueprintNaturalAnchors(secoes, candidatos);
  const ancoras = lida.sections.map(item => item.internalLinks.map(link => link.anchor));
  assert.notEqual(ancoras[0][0], ancoras[1][0], "duas seções, o mesmo Pilar: âncoras diferentes");
  assert.equal(ancoras[1][0], "gerar leads qualificados");
  assert.deepEqual(ancoras[2], ["captar um cliente", "captar um cliente"], "o mesmo link repetido recebe a mesma troca (a coluna o mostra uma vez)");
  assert.equal(lida.changes.length, 3);
  /* Dois destinos com o mesmo recorte: o segundo usa outro. */
  const dois = radarArticleBlueprintNaturalAnchors([secao("Uma", [["K1", "leads"], ["K5", "leads"]])], candidatos);
  const [primeira, segunda] = dois.sections[0].internalLinks.map(link => link.anchor);
  assert.equal(primeira, "leads");
  assert.notEqual(segunda, "leads", "a mesma âncora não leva a dois destinos");
});

test("variedade · no lote do Silo, a linha seguinte usa outro conceito ou recorte para o mesmo destino (o livro de âncoras do arquivo)", async () => {
  const livro: RadarAnchorLedger = new Map();
  const primeira = linksDe(linhaDoArtigo({ anchorLedger: livro }).row.links_internos);
  const segunda = linksDe(linhaDoArtigo({ anchorLedger: livro, articleId: "outro-artigo-do-silo" }).row.links_internos);
  const porDestino = (links: ReturnType<typeof linksDe>) => new Map(links.map(item => [item.destino.replace(/ \(.*$/, ""), item.ancora]));
  const antes = porDestino(primeira);
  const depois = porDestino(segunda);
  for (const destino of ["Suporte \"como captar um cliente\" → https://adalbapro.com.br/leads-sem-trafego-pago/como-captar-um-cliente", "Pilar \"leads qualificados\" → https://adalbapro.com.br/leads-sem-trafego-pago/qualificados"]) {
    assert.ok(antes.get(destino) && depois.get(destino), destino);
    assert.notEqual(antes.get(destino), depois.get(destino), `a segunda linha repetia a âncora de ${destino}`);
  }
  assert.equal(depois.get("Suporte \"como captar um cliente\" → https://adalbapro.com.br/leads-sem-trafego-pago/como-captar-um-cliente"), "como captar");
  /* O lote cria um livro por arquivo (um Silo) e o passa a cada linha. */
  const lote = (await readFile(new URL("../lib/radar/portable-writing-batch.ts", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.match(lote, /const livro: RadarAnchorLedger = new Map\(\);/);
  assert.match(lote, /montar\(artigo, topo, indice \+ 1, silo, false, livro\)/);
  assert.match(lote, /\.\.\.\(anchorLedger \? \{ anchorLedger \} : \{\}\)/);
});

/* ============================== 2 · a leitura da planta gravada ============================== */

test("leitura · a planta gravada antiga (âncora = keyword inteira) passa a sugerir o recorte, sem mudar o payload nem o hash", () => {
  const gravada = plantaGravada();
  const antes = JSON.stringify(gravada);
  const lida = radarArticleBlueprintPayloadReading(gravada);
  assert.equal(JSON.stringify(gravada), antes, "o payload gravado não muda (nem o hash dele)");
  assert.notEqual(lida, gravada);
  const ancoras = lida.blueprint.sections.flatMap(item => item.internalLinks.map(link => [link.candidate, link.anchor]));
  assert.deepEqual(Object.fromEntries(ancoras), {
    K9: "sem tráfego pago",
    K5: "captar um cliente",
    K2: "instagram",
    K3: "captação de pacientes",
    K4: "promoções",
    K1: "gerar leads qualificados",
    K6: "tráfego pago vs orgânico",
    K7: "campanhas de marketing sem anúncios",
    K8: "serviços de SEO para clínicas",
  });
  /* A planta que já segue a regra volta como o MESMO objeto. */
  assert.equal(radarArticleBlueprintPayloadReading(lida), lida);
});

/* ============================== 3 · o pedido e a conferência ============================== */

const briefReal = () => buildRadarArticleBlueprintBrief({ entrada: entrada(), silo: SILO(), articleId: ARTIGO, publication: novo("como-atrair-um-cliente"), siloPublications: PUBLICACOES() });

test("pedido · a regra da âncora natural vai à regra 6; cada candidato K leva a URL canônica e os conceitos do grafo daquele destino", () => {
  const brief = briefReal();
  const pilar = brief.linkCandidates.find(item => item.role === "Pilar")!;
  assert.deepEqual(pilar.anchorConcepts, ["como gerar leads qualificados", "leads qualificados"]);
  assert.equal(pilar.url, `${PREFIXO}/qualificados`);
  assert.equal(brief.linkCandidates.find(item => item.label === "como captar um cliente")?.url, `${PREFIXO}/como-captar-um-cliente`);
  assert.equal(brief.linkCandidates.find(item => item.role === "SiloPage")?.url, PREFIXO);
  assert.equal(brief.linkCandidates.find(item => item.label === "instagram não traz pacientes")?.url, `${PREFIXO}/instagram-nao-traz-pacientes`);
  assert.equal(brief.linkCandidates.some(item => item.anchorConcepts?.some(conceito => /táticas para conseguir clientes|como conquistar clientes/.test(conceito))), false, "o conceito da aresta de entrada não vira âncora de saída");
  const { system, user } = radarArticleBlueprintPrompt(brief);
  assert.ok(system.includes(RADAR_NATURAL_ANCHOR_PROMPT_RULE), "a regra 6 manda o recorte natural");
  assert.match(system, /^6\. Links internos: só para os candidatos K dados, com âncora natural e o motivo\. A ÂNCORA é um recorte natural da ideia do destino/m);
  assert.match(user, new RegExp(`· Pilar · leads qualificados · ${PREFIXO.replace(/[./]/g, "\\$&")}\\/qualificados · planejado · conceitos de âncora do grafo: "como gerar leads qualificados", "leads qualificados"`));
  /* 2026-10-11b · as regras avançaram no mesmo dia (diretriz de comunicação humana); a âncora natural continua nelas. */
  assert.equal(RADAR_ARTICLE_BLUEPRINT_RULES_VERSION, "2026-10-11b");
  const aviso = radarArticleBlueprintRulesNoticeText({ rulesVersion: "2026-10-09b" })!;
  assert.match(aviso, /âncora natural/);
  assert.match(aviso, /já trocam, ao ler esta versão, a âncora que é a keyword inteira do destino/);
  semD10(aviso, "aviso das regras");
});

test("conferência · a planta nova com a keyword inteira como âncora sai com o recorte, e a nota é correção (não pendência)", () => {
  const brief = briefReal();
  const ai = RadarArticleBlueprintAiSchema.parse(respostaDaPlanta(brief));
  const pedidas = ai.sections.flatMap(item => item.internalLinks);
  assert.ok(pedidas.length >= 2, "a resposta da IA põe links com o nome do destino como âncora");
  const { payload, notes } = radarSanitizeArticleBlueprint(ai, brief, { close: true });
  const rotulo = new Map(brief.linkCandidates.map(item => [item.id, item.label.replace(/^SiloPage\s+"|"$/g, "")]));
  for (const link of payload.blueprint.sections.flatMap(item => item.internalLinks)) {
    if (/Página da marca/.test(brief.linkCandidates.find(item => item.id === link.candidate)?.role || "")) continue;
    assert.equal(radarAnchorRepeatsKeyword(link.anchor, [rotulo.get(link.candidate) || ""]), false, `${link.candidate}: ${link.anchor}`);
  }
  const ajustes = notes.filter(item => /âncora ".*" ajustada para/.test(item));
  assert.ok(ajustes.length >= 2, notes.join("\n"));
  assert.equal(radarArticleBlueprintPendingNotes(ajustes).pending.length, 0, "a troca é correção aplicada, não pede ação");
  assert.equal(payload.rulesVersion, "2026-10-11b");
  assert.ok(payload.linkCandidates.find(item => item.role === "Pilar")?.anchorConcepts?.length, "a planta nova grava os conceitos do candidato");
});

/* ============================== 4 · o CSV "Para escrever" ============================== */

test("CSV · o bloco Publicação abre a coluna artigo: URL canônica planejada para o novo, a gravada preservada para o publicado", () => {
  const artigo = linhasDe(linhaDoArtigo().row.artigo);
  assert.deepEqual(artigo.slice(0, 5), [
    "Publicação (para conferir e aprovar no momento de postar):",
    `- Silo: Leads sem Tráfego Pago · URL do Silo: ${PREFIXO} (página do Silo nova, ainda não publicada)`,
    "- Slug: como-atrair-um-cliente",
    `- URL canônica: ${PREFIXO}/como-atrair-um-cliente`,
    "- Situação: novo (ainda não publicado)",
  ]);
  assert.equal(artigo.filter(item => /^Slug: /.test(item)).length, 0, "o slug solto saiu (está no bloco)");
  /* Publicado em outro endereço (o gravado vence o calculado: URL, slug e canonical preservados). */
  const noAr: RadarWritingPublication = { published: true, publishedUrl: `${SITE}/blog/como-atrair-um-cliente`, canonical: `${SITE}/blog/como-atrair-um-cliente`, slug: "como-atrair-um-cliente", principalPolicy: "locked" };
  const publicado = linhasDe(linhaDoArtigo({ publication: noAr }).row.artigo);
  assert.equal(publicado[3], `- URL canônica: ${SITE}/blog/como-atrair-um-cliente`);
  assert.equal(publicado[4], "- Situação: publicado (preservar URL, slug e canonical)");
  assert.ok(publicado.includes(`Publicado: ${SITE}/blog/como-atrair-um-cliente — preservar URL, slug e canonical`));
});

test("CSV · links: âncora sugerida (o recorte), URL canônica completa do destino novo, publicado com a URL publicada, só os L indicados", () => {
  const row = linhaDoArtigo().row;
  const coluna = row.links_internos;
  const cabecalho = linhasDe(coluna)[0];
  assert.equal(cabecalho, `Aplique somente estes 9 link(s) (L1, L2…), sem criar outros. ${RADAR_NATURAL_ANCHOR_RULE} Use a âncora sugerida (pode ajustar concordância) ou uma das outras formulações; o link aponta para a URL canônica do destino, a do slug dele.`);
  assert.match(cabecalho, /nunca a keyword principal inteira do destino/);
  assert.match(cabecalho, /em outro artigo do mesmo Silo/);
  const links = linksDe(coluna);
  assert.equal(links.length, 9);
  const de = (trecho: string) => links.find(item => item.destino.includes(trecho))!;
  assert.equal(de("SiloPage \"Leads sem Tráfego Pago\"").destino, `SiloPage "Leads sem Tráfego Pago" → ${PREFIXO} (novo, ainda não publicado: o link entra quando o destino estiver no ar)`);
  assert.equal(de("como captar um cliente").destino, `Suporte "como captar um cliente" → ${PREFIXO}/como-captar-um-cliente (novo, ainda não publicado: o link entra quando o destino estiver no ar)`);
  assert.equal(de("leads qualificados").destino, `Pilar "leads qualificados" → ${PREFIXO}/qualificados (novo, ainda não publicado: o link entra quando o destino estiver no ar)`);
  assert.equal(de("tráfego pago vs orgânico").destino, `Suporte "tráfego pago vs orgânico para clínica de estética" → ${PREFIXO}/trafego-pago-vs-organico-para-clinica-de-estetica (publicado)`);
  assert.deepEqual(links.map(item => item.ancora), [
    "sem tráfego pago", "captar um cliente", "instagram", "captação de pacientes", "promoções", "gerar leads qualificados",
    "tráfego pago vs orgânico", "campanhas de marketing sem anúncios", "serviços de SEO para clínicas",
  ]);
  /* Nenhuma âncora é a keyword inteira do destino (o caso do texto "A comparação de [tráfego pago vs orgânico para clínica de estética]"). */
  for (const link of links) {
    const destino = link.destino.match(/^[^"]*"([^"]+)"/)?.[1] || "";
    if (/Página da marca/.test(link.destino)) continue;
    assert.equal(radarAnchorRepeatsKeyword(link.ancora, [destino]), false, link.linha);
  }
  assert.doesNotMatch(coluna, /\(planejado|→ \/[a-z]/, "nenhum destino só com o slug");
  /* A estrutura diz o L e a âncora sugerida, na seção do link. */
  assert.match(row.estrutura, /^- Link interno L2: âncora sugerida "captar um cliente" → como captar um cliente$/m);
  assert.match(row.estrutura, /^- Link interno L6: âncora sugerida "gerar leads qualificados" → leads qualificados$/m);
  assert.doesNotMatch(row.estrutura, /âncora "tráfego pago vs orgânico para clínica de estética"|âncora sugerida "campanhas de marketing para clínica de estética sem anúncios"/);
  /* A regra geral 9 da linha "Silo" diz a mesma regra. */
  assert.equal(RADAR_WRITING_GENERAL_RULES[8], `Links internos: só os indicados em cada artigo (L1, L2…), sem criar outros, cada um para a URL canônica do destino. ${RADAR_NATURAL_ANCHOR_RULE}`);
});

test("CSV · nenhuma coluna manda usar a keyword inteira como âncora", () => {
  const artigo = linhaDoArtigo();
  const topo = buildRadarWritingTopRow({ label: "Silo", silo: SILO(), articles: [artigo], siteUrl: SITE, memberPublications: PUBLICACOES(), authorsKnown: true });
  const tudo = `${tudoDaLinha(topo)}\n${tudoDaLinha(artigo.row)}`;
  assert.doesNotMatch(tudo, /com a âncora indicada|com a âncora e o destino dados|âncora = keyword|use a keyword (?:principal )?(?:inteira )?como âncora/i);
  assert.doesNotMatch(tudo, /âncora (?:sugerida )?"(?:leads qualificados|como captar um cliente|promoções para estética|tráfego pago vs orgânico para clínica de estética|Leads sem Tráfego Pago)"/i);
});

test("CSV · ordem narrativa com URL canônica completa e situação; sem 'fora desta seleção'; a linha 'Silo' em português claro", () => {
  const artigo = linhaDoArtigo();
  const topo = buildRadarWritingTopRow({ label: "Silo", silo: SILO(), articles: [artigo], siteUrl: SITE, memberPublications: PUBLICACOES(), authorsKnown: true });
  const ordem = linhasDe(topo.artigo).slice(linhasDe(topo.artigo).findIndex(item => item.startsWith("Ordem narrativa")));
  assert.deepEqual(ordem, [
    "Ordem narrativa (papel · artigo · URL canônica · situação):",
    `1 · Pilar · leads qualificados · ${PREFIXO}/qualificados · novo, ainda não publicado`,
    `2 · Suporte · instagram não traz pacientes · ${PREFIXO}/instagram-nao-traz-pacientes · publicado`,
    `3 · Suporte · captação de pacientes sem tráfego pago · ${PREFIXO}/captacao-de-pacientes-sem-trafego-pago · publicado`,
    `4 · Suporte · promoções para estética · ${PREFIXO}/promocoes-para-estetica · publicado`,
    `5 · Suporte · como captar um cliente · ${PREFIXO}/como-captar-um-cliente · novo, ainda não publicado`,
    `6 · Suporte · tráfego pago vs orgânico para clínica de estética · ${PREFIXO}/trafego-pago-vs-organico-para-clinica-de-estetica · publicado`,
    `7 · Suporte · campanhas de marketing para clínica de estética sem anúncios · ${PREFIXO}/campanhas-de-marketing-para-clinica-de-estetica-sem-anuncios · publicado`,
    `8 · Suporte · como atrair um cliente · ${PREFIXO}/como-atrair-um-cliente · novo, ainda não publicado ← este artigo`,
    "Os artigos sem \"←\" não têm linha neste arquivo: aparecem aqui só como destinos de link.",
  ]);
  assert.doesNotMatch(tudoDaLinha(topo), /fora do arquivo|fora desta seleção|· neste arquivo\b/);
  assert.equal(topo.pode_escrever, [
    "Sim: Este arquivo traz 1 dos 8 artigos do Silo; os outros aparecem na ordem narrativa como destinos de link, com a URL canônica e a situação de cada um.",
    "- autoria: cada artigo diz quem assina (o especialista da aba Especialista); revisor não faz parte deste arquivo.",
  ].join("\n"));
  /* Os outros estados do Radar continuam ditos, em português claro. */
  const silo = SILO();
  silo.members = silo.members.map(item => (item.articleId === "sup-captar" ? { ...item, statusLabel: "não enviado ao Radar" } : item.articleId === "pilar-leads" ? { ...item, statusLabel: "no Radar sob outro silo" } : item));
  const comEstados = buildRadarWritingTopRow({ label: "Silo", silo, articles: [artigo], siteUrl: SITE, memberPublications: PUBLICACOES(), authorsKnown: true });
  assert.match(comEstados.artigo, /^5 · Suporte · como captar um cliente · https:\/\/adalbapro\.com\.br\/leads-sem-trafego-pago\/como-captar-um-cliente · novo, ainda não publicado · ainda não enviado ao Radar$/m);
  assert.match(comEstados.artigo, /^1 · Pilar · leads qualificados · .* · registrado no Radar em outro Silo$/m);
  assert.match(comEstados.pode_escrever, /- na ordem narrativa: "leads qualificados" \(registrado no Radar em outro Silo\), "como captar um cliente" \(ainda não enviado ao Radar\)\./);
  /* Bloqueio, Silo em formação ou autoria fora do arquivo continuam sendo ressalva. */
  assert.match(buildRadarWritingTopRow({ label: "Silo", silo: { ...SILO(), draft: true }, articles: [artigo], siteUrl: SITE, memberPublications: PUBLICACOES(), authorsKnown: true }).pode_escrever, /^Com ressalva: /);
  assert.match(buildRadarWritingTopRow({ label: "Silo", silo: SILO(), articles: [artigo], siteUrl: SITE, memberPublications: PUBLICACOES() }).pode_escrever, /^Com ressalva: /);
});

/* ============================== 5 · a identidade de publicação ============================== */

test("identidade · uma função só: publicado preservado, novo pelo Silo, sem SiloPage pelo caminho dos irmãos no ar ou pelo site, sem nada só o slug", () => {
  const silo = { label: "Leads sem Tráfego Pago", page: { canonical: PREFIXO, published: false } };
  assert.equal(radarPublicationIdentity({ slug: "como-atrair-um-cliente", published: false, silo }).url, `${PREFIXO}/como-atrair-um-cliente`);
  const noAr = radarPublicationIdentity({ slug: "como-atrair-um-cliente", published: true, publishedUrl: `${SITE}/antigo/como-atrair-um-cliente`, canonical: `${SITE}/canonico`, silo });
  assert.deepEqual([noAr.url, noAr.origin, noAr.situation], [`${SITE}/antigo/como-atrair-um-cliente`, "published", "publicado (preservar URL, slug e canonical)"]);
  assert.equal(radarPublicationIdentity({ slug: "x", published: true, canonical: `${SITE}/canonico`, silo }).url, `${SITE}/canonico`, "publicado sem URL: o canonical gravado");
  assert.equal(radarSiloBaseFromPublished([...PUBLICACOES().values()]), PREFIXO, "o caminho do Silo pelos irmãos no ar");
  const semPagina = radarSiloPublicationIdentities({ silo: { ...SILO(), siloPage: null }, publications: PUBLICACOES() });
  assert.equal(semPagina.members.get("sup-captar")?.url, `${PREFIXO}/como-captar-um-cliente`);
  assert.equal(radarPublicationIdentity({ slug: "como-atrair-um-cliente", siteOrigin: SITE }).url, `${SITE}/como-atrair-um-cliente`);
  const nada = radarPublicationIdentity({ slug: "como-atrair-um-cliente" });
  assert.deepEqual([nada.url, nada.address, nada.note], [null, "/como-atrair-um-cliente", RADAR_PUBLICATION_NO_SILO]);
  assert.equal(radarPublicationIdentityLines(nada)[3], `- URL canônica: /como-atrair-um-cliente (${RADAR_PUBLICATION_NO_SILO})`);
});

/* ============================== 6 · paridade: Redator, vídeo e MCP ============================== */

test("paridade · o Redator lê as mesmas âncoras do CSV (a mesma leitura compartilhada) e a regra é a mesma frase", async () => {
  const gravada = plantaGravada();
  const csv = linksDe(linhaDoArtigo().row.links_internos).map(item => item.ancora);
  const redator = writerArticleBlueprintForWriting({
    id: "bp-1", versionNumber: 1, approvedAt: "2026-10-10T12:00:00.000Z", blueprint: gravada.blueprint, plan: gravada.measures.plan,
    linkCandidates: gravada.linkCandidates, brandVoice: null, sources: gravada.sources,
  })!;
  assert.deepEqual(redator.sections.flatMap(item => item.internalLinks.map(link => link.anchor)), csv);
  assert.equal(WRITER_BLUEPRINT_READING_RULES, "2026-10-11b", "a fatia radar.blueprint/<id> muda com a leitura");
  const semComentario = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const prompts = semComentario(await readFile(new URL("../lib/redator/prompts.ts", import.meta.url), "utf8"));
  assert.match(prompts, /os links internos dela com a âncora sugerida, sem criar link fora dela\. \$\{RADAR_NATURAL_ANCHOR_RULE\}/);
  const fundamentos = semComentario(await readFile(new URL("../lib/server/writer-evidence-reader.ts", import.meta.url), "utf8"));
  assert.match(fundamentos, /links internos com a âncora sugerida, fechamento e CTA\); o integral está em articleBlueprint\.readAt\. \$\{RADAR_NATURAL_ANCHOR_RULE\}/);
  assert.match(fundamentos, /linkCandidates: conteudo\.linkCandidates/);
  const mcp = semComentario(await readFile(new URL("../app/api/mcp/redator/route.ts", import.meta.url), "utf8"));
  assert.match(mcp, /links internos com a âncora sugerida e o CTA \(\$\{RADAR_NATURAL_ANCHOR_RULE\}\)/);
  assert.doesNotMatch(mcp, /âncoras indicadas/);
});

test("paridade · o CSV de vídeo identifica o artigo pelo mesmo bloco e leva o link da descrição à mesma URL canônica", () => {
  const video = buildRadarVideoExportArticle(entrada(), { position: 1, youtube: null, blueprint: plantaGravada(), publication: novo("como-atrair-um-cliente"), silo: SILO(), siloPublications: PUBLICACOES() }).row;
  const bloco = linhasDe(linhaDoArtigo().row.artigo).slice(0, 5);
  const tema = linhasDe(video.tema_e_publico);
  const inicio = tema.indexOf(bloco[0]);
  assert.ok(inicio > 0, video.tema_e_publico);
  assert.deepEqual(tema.slice(inicio, inicio + 5), bloco);
  assert.match(video.diretrizes_de_roteiro, new RegExp(`o link do artigo \\(${PREFIXO.replace(/[./]/g, "\\$&")}\\/como-atrair-um-cliente\\)`));
  assert.doesNotMatch(Object.values(video).join("\n"), /\(\/como-atrair-um-cliente\)/, "nunca só o slug quando o Silo é conhecido");
  semD10(Object.values(video).join("\n"), "CSV de vídeo");
});

test("paridade · o MCP entrega os mesmos arquivos (get_article_for_writing e get_video_material pelas mesmas funções) e o catálogo diz a regra", async () => {
  const semComentario = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const material = semComentario(await readFile(new URL("../lib/server/radar-mcp-material.ts", import.meta.url), "utf8"));
  assert.match(material, /const PROJECOES: RadarMcpMaterialProjections = \{ writing: radarPortableWritingExport, video: radarPortableVideoExport \};/);
  assert.match(material, /projecoes\.video\(\{ [^}]*publications: montagem\.publicacoes \}\)/);
  assert.match(material, /projecoes\.writing\(\{[\s\S]*?publications: montagem\.publicacoes/);
  const rota = semComentario(await readFile(new URL("../app/api/editorial/radar-export/route.ts", import.meta.url), "utf8"));
  assert.match(rota, /radarPortableVideoExport\(\{ [^}]*publications: publicacoes \}\)/);
  const catalogo = await readFile(new URL("../lib/agent/platform-catalog.ts", import.meta.url), "utf8");
  assert.match(catalogo, /"Âncora natural e identidade de publicação \(2026-10-11;/);
  assert.match(catalogo, /nunca a keyword principal inteira do destino/);
  assert.match(catalogo, /bloco 'Publicação \(para conferir e aprovar no momento de postar\)'/);
  assert.doesNotMatch(catalogo, /links internos com as âncoras indicadas/);
});

/* ============================== 7 · D10 ============================== */

test("D10 · a linha do artigo, a linha 'Silo' e o CSV inteiro saem concluídos", () => {
  const artigo = linhaDoArtigo();
  const topo = buildRadarWritingTopRow({ label: "Silo", silo: SILO(), articles: [artigo], siteUrl: SITE, memberPublications: PUBLICACOES(), authorsKnown: true });
  const csv = radarWritingExportCsv([topo, artigo.row]);
  semD10(csv, "CSV para escrever");
  semD10(RADAR_NATURAL_ANCHOR_RULE, "regra");
  semD10(RADAR_NATURAL_ANCHOR_PROMPT_RULE, "regra do pedido");
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
