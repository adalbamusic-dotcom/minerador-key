import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildRadarEditorialArticleModel,
  radarEditorialHeadingNoiseReason,
  radarEditorialStemIsContent,
  type RadarEditorialArticleModel,
} from "../lib/radar/editorial-article-model.ts";
import type { RadarEditorialBlueprint, RadarSectionCandidate } from "../lib/radar/editorial-blueprint.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarCompetitiveObservedModel } from "../lib/radar/competitive-observed-model.ts";
import {
  RADAR_WRITING_NO_APPROVED_LINK,
  buildRadarWritingExportArticle,
  buildRadarWritingTopRow,
  radarWritingApprovedAnswer,
  radarWritingExportCsv,
  radarWritingSameItem,
  radarWritingStripHeadingTemplate,
  radarWritingTitleIsFragmented,
  type RadarWritingArticleContext,
  type RadarWritingExportArticle,
  type RadarWritingPublication,
} from "../lib/radar/portable-writing-export.ts";
import { radarPortableWritingExport } from "../lib/radar/portable-writing-batch.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import type { RadarSiloExportWritingContext } from "../lib/radar/portable-silo-export.ts";
import type { RadarCompetitorOutlinePage } from "../lib/radar/competitor-topics.ts";
import {
  ARTIGO,
  ARTIGO_AMAZON,
  EXPORTADO_EM,
  LEITURA_DAS_LENTES,
  entradaGoogle,
  montadasDoSiloSaude,
  planoDoSilo,
} from "./radar-portable-writing-fixtures.mts";

/*
 * ===== 2026-10-08 · P0-B E P1 · O CSV "PARA ESCREVER" SEM ARTIGO-MODELO =====
 *
 * Os 8 CSVs do Silo "Leads sem Tráfego Pago" (sete sem artigo-modelo) traziam,
 * na estrutura legada do modelo da SERP:
 *   (1) "Obrigatória pelo ArticleDNA" em "Como ganhar dinheiro com IA…" (casamento
 *       por "ganhar"/"mais" das complementares);
 *   (2) título de post, encerramento, propaganda de concorrente, inglês e
 *       newsletter como seção, e os moldes "no dia a dia?", "O que considerar
 *       sobre", "Afinal,", "Na prática, o que";
 *   (3) H1 e H2 picotados ("Como atrair cliente e praticidade: atrair clientes e
 *       fazer um pitch…", "Atrair cliente e clientes");
 *   (4) o mesmo item no "Não cobrir" e na estrutura;
 *   (5) cookie, CPF, e-MEC, W3C, aposta e LAI nas fontes, newsletter e loja nas
 *       perguntas, temas sobre 23 páginas com a lista dizendo 12;
 *   (6) a resposta aprovada do especialista cortada em "…";
 *   (7) duas chamadas no fim (especialista + "próximo passo") e "peça ao Arquiteto";
 *   (8) os 7 links do Pilar numa seção só;
 *   (9) "destino ainda não publicado" para irmãos publicados;
 *   (10) promoções bloqueado sem estrutura do modelo, com a página publicada lida.
 *
 * Um teste de ponta a ponta por defeito, do modelo editorial da SERP (a origem
 * da obrigatoriedade e do cabeçalho) ao CSV. As fixtures imitam os casos reais:
 * os cabeçalhos, perguntas e fontes vêm dos CSVs do dono; o resto é inventado.
 * No fim, a varredura D10 do CSV inteiro. PROVIDER_CALLS = 0.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* A lista do desenho (D10) para o entregável. */
const D10 = [/\bpend[eê]ncia/i, /\bpendente\b/i, /aguardando aprova/i, /confira antes/i, /rascunho/i, /fonte a obter/i, /preencher/i, /peça ao Arquiteto/i];
/* O trecho de terceiro (snippet entre “…”) é pesquisa citada como veio, não instrução do entregável. */
const doExport = (texto: string) => texto.replace(/“[^”]*”/g, "“…”");
const linhas = (texto: string) => texto.split("\n");
const titulos = (estrutura: string) => linhas(estrutura).filter(linha => /^#{2,3} /.test(linha));

/* ============================== o modelo editorial da SERP ============================== */

const AMOSTRA = 23;
let sequencia = 0;

function candidato(titulo: string, paginas: number, perguntas: string[] = [titulo]): RadarSectionCandidate {
  sequencia += 1;
  return {
    id: `candidate-${sequencia}`, conceptId: `concept-${sequencia}`, workingTitle: titulo, conceptTypeLabel: "Assunto",
    purpose: `Cobrir "${titulo}".`, priority: "RECOMMENDED", placement: "FLEXIBLE", placementReason: "",
    questions: perguntas.map((text, indice) => ({ id: `q-${sequencia}-${indice}`, text, priority: "RECOMMENDED", answerRequirement: "", marketStatement: "", factualSupport: "NOT_REQUIRED" })),
    definitions: [], entities: { primary: null, related: [] },
    marketEvidence: { pages: paginas, sampleSize: AMOSTRA, statement: `${paginas} de ${AMOSTRA}` },
    factualStatus: "NOT_REQUIRED", factualNote: "", specialistRequirementIds: [], internalLinks: [],
    videoOpportunityId: null, differentiation: null, limitations: [], provenance: [], confidence: "MEDIUM",
  } as unknown as RadarSectionCandidate;
}

const contextoDoArtigo = (principal: string, complementares: string[], topicos: string[] = []): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "marca-1", articleId: ARTIGO, articleDnaVersionId: "dna-v1", articleDnaContentHash: "hash-dna-v1",
    promise: null, mainIntent: "informacional", hierarchy: "Suporte",
    classification: { intent: "INFORMATIONAL", intentLabel: "Informacional", funnel: "TOP", funnelLabel: "Topo", reason: "Fechado pelo Arquiteto." },
  },
  keywords: [principal, ...complementares].map((text, indice) => ({ identity: { keywordId: `kw-${indice}`, role: indice ? "secundaria" : "principal", text } })),
  /* Como no DNA real: a cobertura declarada repete as keywords da composição. */
  editorialTopics: [principal, ...complementares, ...topicos],
  resolvedKeywordTexts: [principal, ...complementares],
  silo: { siloId: "silo-leads", siloName: "Leads sem Tráfego Pago", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const observadoComConcorrentes = (dominios: string[]): RadarCompetitiveObservedModel => ({
  sample: { comparablePages: AMOSTRA, uniqueReferences: 30, analyzedSuccess: AMOSTRA, failedFinal: 0 },
  concepts: { all: [], recurrent: [], confirmed: [], undercovered: [], isolated: [] },
  structure: { measures: [], presences: [], patterns: [] },
  questions: [], entities: { primary: [], related: [] }, gaps: [], differentiations: [], conflicts: [],
  competitors: dominios.map(domain => ({ url: `https://${domain}/blog/artigo`, domain, title: domain, comparable: true })),
  internalLinkPlan: { outgoing: [], siloPage: null },
  authorityEvidence: { specialistReviewRequirements: [] },
  aiDiscovery: { answerableUnits: [], definitionRequirements: [] },
  intent: { declared: "informacional", observedInSerp: "informacional" },
} as unknown as RadarCompetitiveObservedModel);

const blueprintDe = (secoes: RadarSectionCandidate[], principal: string): RadarEditorialBlueprint => ({
  article: { title: null, principal, objective: "Cobrir o tema.", intent: "Informacional", funnel: "Topo", siloRole: "SUPORTE" },
  opening: { directives: ["Responder diretamente."], evidence: "" }, sections: secoes,
  closing: { directives: [], evidence: "" }, essentialQuestions: [], entities: { primary: [], related: [] },
  differentiation: { marketCovers: [], underCovered: [], ownOpportunities: [] },
  unresolvedLinks: [], specialistBriefs: [], videoBriefs: [], limitations: [], readiness: { state: "PARTIAL", reason: "" },
} as unknown as RadarEditorialBlueprint);

/* O artigo "como atrair um cliente", com os cabeçalhos do CSV real. */
const ATRAIR = "como atrair um cliente";
const COMPLEMENTARES_ATRAIR = ["como conquistar novos clientes", "como ganhar um cliente", "como conseguir mais clientes", "como atrair mais clientes", "como conquistar clientes"];
const CONCORRENTES_ATRAIR = ["www.agendor.com.br", "www.serasaexperian.com.br", "www.salesforce.com", "www.kyte.com.br", "www.minu.co", "www.alugueon.com.br", "www.bagy.com.br", "www.rdstation.com"];
const RUIDOS_ATRAIR = [
  "Como fazer um pitch de vendas eficiente? Guia para converter clientes",
  "Como ganhar dinheiro com IA: o guia para começar do zero",
  "Como descobrir e captar clientes potenciais: 13 dicas para te ajudar",
  "Como fidelizar clientes através do feedback? Saiba mais!",
  "Gostou de saber mais sobre como atrair clientes?",
  "Tudo certo sobre como atrair clientes para loja?",
  "Como a AlugueON ajuda a atrair clientes com mídia em shoppings?",
  "Why's it important to get new clients?",
  "Deseja receber e-mails com novos eventos e conteúdos exclusivos?",
  "O que fazer para conquistar novos clientes? 10 dicas infalíveis",
];

function modeloAtrair(topicosExtras: string[] = []): RadarEditorialArticleModel {
  sequencia = 0;
  const secoes = [
    candidato("Como atrair clientes?", 4),
    candidato("Onde estão os clientes com mais chances de conversão?", 2),
    candidato("Qual a importância de conquistar novos clientes?", 2),
    candidato("Por que conhecer o cliente faz toda a diferença", 3, ["Por que conhecer o cliente faz toda a diferença"]),
    candidato("Praticidade para o cliente", 3),
    candidato("Como conseguir mais clientes com estratégia omnichannel", 2),
    candidato("Como transformar visitantes em clientes fiéis?", 2),
    ...RUIDOS_ATRAIR.map((titulo, indice) => candidato(titulo, indice ? 2 : 12)),
  ];
  return buildRadarEditorialArticleModel({
    context: contextoDoArtigo(ATRAIR, COMPLEMENTARES_ATRAIR, topicosExtras),
    observed: observadoComConcorrentes(CONCORRENTES_ATRAIR),
    blueprint: blueprintDe(secoes, ATRAIR),
  });
}

const AVULSO: RadarWritingArticleContext = { topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: null };

function entradaDoArtigo(modelo: RadarEditorialArticleModel, principal: string, complementares: string[], extra: Partial<RadarPortableExportInput> = {}): RadarPortableExportInput {
  const base = entradaGoogle();
  return {
    ...base,
    article: {
      ...base.article, principalKeyword: principal, secondaryKeywords: complementares, mustCover: [principal, ...complementares],
      /* O público da Skill de voz real: biomédicas estetas e profissionais de estética que atendem em clínicas. */
      slug: principal.replace(/\s+/g, "-"), audience: "Biomédicas estetas e profissionais de estética e cosmética que atendem em clínicas e consultórios.",
      siloName: "Leads sem Tráfego Pago", articleRole: "support", promise: null,
    },
    articleModel: modelo,
    internalLinks: [],
    ...extra,
  };
}

const linhaDe = (entrada: RadarPortableExportInput, contexto: RadarWritingArticleContext = AVULSO): RadarWritingExportArticle => buildRadarWritingExportArticle(entrada, contexto);
const csvDe = (...artigos: RadarWritingExportArticle[]) => radarWritingExportCsv([
  buildRadarWritingTopRow({ label: "Marca", silo: null, articles: artigos, siteUrl: "https://adalbapro.com.br" }),
  ...artigos.map(item => item.row),
]);
const CSVS: string[] = [];

/* ============================== (1) a obrigatoriedade ============================== */

test("P0-B (1) · 'Obrigatória pelo ArticleDNA' só por termo de conteúdo: 'ganhar', 'mais' e 'conquistar' das complementares não exigem nada", () => {
  for (const palavra of ["ganhar", "conseguir", "conquistar", "novo", "mais", "voce", "sobre", "dica", "guia", "gerar"]) {
    assert.equal(radarEditorialStemIsContent(palavra === "dica" ? "dica" : palavra), false, palavra);
  }
  for (const palavra of ["omnichannel", "identific", "solar", "captaca", "lista"]) assert.equal(radarEditorialStemIsContent(palavra), true, palavra);

  /* Só as keywords da composição como cobertura: nenhuma seção de concorrente fica obrigatória por elas. */
  const modelo = modeloAtrair();
  const secoes = modelo.sections.flatMap(secao => [secao, ...secao.childSections]);
  assert.equal(secoes.some(secao => secao.mustCoverReasons.length), false, secoes.filter(secao => secao.mustCoverReasons.length).map(secao => secao.headingSuggestion).join(" | "));
  const linha = linhaDe(entradaDoArtigo(modelo, ATRAIR, COMPLEMENTARES_ATRAIR));
  CSVS.push(csvDe(linha));
  assert.doesNotMatch(linha.row.estrutura, /Obrigatória pelo ArticleDNA/);
  assert.doesNotMatch(linha.row.estrutura, /ganhar dinheiro/i);

  /* Com um tópico de CONTEÚDO na cobertura, a seção que o trata fica obrigatória — e só ela. */
  const comTopico = modeloAtrair(["estratégia omnichannel"]);
  const exigidas = comTopico.sections.flatMap(secao => [secao, ...secao.childSections]).filter(secao => secao.mustCoverReasons.length);
  assert.deepEqual(exigidas.map(secao => /omnichannel/i.test(`${secao.headingSuggestion} ${secao.readerQuestion}`)), [true], exigidas.map(secao => secao.headingSuggestion).join(" | "));
  const estrutura = linhaDe(entradaDoArtigo(comTopico, ATRAIR, COMPLEMENTARES_ATRAIR, { article: { ...entradaDoArtigo(comTopico, ATRAIR, COMPLEMENTARES_ATRAIR).article, mustCover: [ATRAIR, ...COMPLEMENTARES_ATRAIR, "estratégia omnichannel"] } })).row.estrutura;
  assert.equal(estrutura.split("Obrigatória pelo ArticleDNA").length - 1, 1, estrutura);
  assert.match(estrutura, /omnichannel[^\n]*\n(?:- [^\n]*\n)*- Obrigatória pelo ArticleDNA\./i);
});

/* ============================== (2) o cabeçalho que não é seção e o molde ============================== */

test("P0-B (2) · título de post, encerramento, propaganda, inglês e newsletter saem da estrutura; o que fica leva a pergunta do leitor, sem molde", () => {
  const modelo = modeloAtrair();
  /* No modelo: cada ruído fica como evidência, com o motivo, e nunca vira seção. */
  for (const titulo of RUIDOS_ATRAIR) {
    const candidato = modelo.candidates.find(item => item.observedLabel === titulo);
    assert.equal(candidato?.verdict, "OPTIONAL_EVIDENCE", titulo);
    assert.match(candidato!.reason, /^Cabeçalho de concorrente que não vira seção \(/, titulo);
  }
  const contexto = { core: [ATRAIR, ...COMPLEMENTARES_ATRAIR], competitorDomains: CONCORRENTES_ATRAIR };
  assert.equal(radarEditorialHeadingNoiseReason("Como a AlugueON ajuda a atrair clientes com mídia em shoppings?", contexto), "produto de terceiro");
  assert.equal(radarEditorialHeadingNoiseReason("O que fazer para conquistar novos clientes? 10 dicas infalíveis", contexto), "título de post");
  assert.equal(radarEditorialHeadingNoiseReason("Onde estão os clientes com mais chances de conversão?", contexto), null);

  const linha = linhaDe(entradaDoArtigo(modelo, ATRAIR, COMPLEMENTARES_ATRAIR));
  const estrutura = linha.row.estrutura;
  for (const ruido of [/pitch de vendas/i, /ganhar dinheiro/i, /13 dicas/, /Saiba mais/, /gostou de saber/i, /tudo certo sobre/i, /AlugueON/, /Why's/, /receber e-mails/, /10 dicas infalíveis/]) {
    assert.doesNotMatch(estrutura, ruido, String(ruido));
  }
  /* O molde não chega ao CSV: nem no título da seção, nem no respiro, nem no fechamento. */
  for (const titulo of titulos(estrutura)) {
    assert.doesNotMatch(titulo, /no dia a dia\?|O que considerar sobre|^#+ Afinal,|^#+ Na prática, o que/, titulo);
  }
  assert.doesNotMatch(`${linha.row.plano_visual}\n${linha.row.links_internos}\n${linha.row.promessa_e_leitor}`, /no dia a dia|O que considerar sobre|Afinal, /);
  /* A pergunta do leitor é o título de trabalho, e isso é dito. */
  assert.ok(titulos(estrutura).includes("## Como atrair clientes?"), titulos(estrutura).join(" | "));
  assert.ok(titulos(estrutura).some(titulo => /^#{2,3} Onde estão os clientes com mais chances de conversão\?$/.test(titulo)));
  assert.ok(titulos(estrutura).some(titulo => /^#{2,3} Praticidade para o cliente$/.test(titulo)), "sem pergunta, o cabeçalho sem o molde");
  assert.match(estrutura, /^Títulos de trabalho: cada seção leva a pergunta do leitor que ela responde\. Reescreva-os na voz da marca, sem copiar cabeçalho de concorrente\.$/m);

  /* A régua de tirar o molde, para qualquer assunto. */
  assert.equal(radarWritingStripHeadingTemplate("Como montar a rotina de skincare facial no dia a dia?"), "Como montar a rotina de skincare facial?");
  assert.equal(radarWritingStripHeadingTemplate("O que considerar sobre praticidade para o cliente?"), "Praticidade para o cliente");
  assert.equal(radarWritingStripHeadingTemplate("Afinal, qual a importância de conquistar novos clientes?"), "Qual a importância de conquistar novos clientes?");
  assert.equal(radarWritingStripHeadingTemplate("Na prática, o que faz um captador de clientes?"), "O que faz um captador de clientes?");
  assert.equal(radarWritingStripHeadingTemplate("Como fidelizar clientes através do feedback? Saiba mais! no dia a dia?"), "Como fidelizar clientes através do feedback? Saiba mais!");

  /* No export também (modelo antigo ou montado à mão): a seção de título de post sem pergunta utilizável sai, e isso é dito. */
  const comPost: RadarEditorialArticleModel = {
    ...modelo,
    sections: [...modelo.sections, { ...modelo.sections[0], id: "section:post", headingSuggestion: "Como fazer um pitch de vendas eficiente? Guia para converter clientes no dia a dia?", readerQuestion: "Como fazer um pitch de vendas eficiente? Guia para converter clientes", mustCoverReasons: [], childSections: [] }],
  };
  const comPostNaEstrutura = linhaDe(entradaDoArtigo(comPost, ATRAIR, COMPLEMENTARES_ATRAIR)).row.estrutura;
  assert.doesNotMatch(comPostNaEstrutura, /pitch de vendas/i);
  assert.match(comPostNaEstrutura, /^Uma seção do modelo da SERP ficou de fora: título de post, encerramento ou propaganda de concorrente não é seção deste artigo\.$/m);
});

/* ============================== (3) H1 e H2 picotados ============================== */

test("P0-B (3) · H1 picotado vira 'formule a partir da promessa'; o bloco picotado sai com a pergunta do leitor, uma vez só", () => {
  const PICOTADOS: Array<[string, string, string[]]> = [
    ["Como atrair cliente e praticidade: atrair clientes e fazer um pitch de vendas eficiente? guia para converter clientes", ATRAIR, COMPLEMENTARES_ATRAIR],
    ["Como identificar um lead qualificado na prática: qualificados e gerar e o que considerar sobre estratégias para gerar", "leads qualificados", ["gerar leads qualificados"]],
    ["Como campanhas marketing e digital: o que caracteriza marketing digital e o que considerar sobre exemplos dos 4 ps", "campanhas de marketing", []],
    ["Como fazer tráfego orgânico: pacientes dentista e tráfego e o que caracteriza tráfego orgânico", "captação de pacientes dentista", ["tráfego orgânico como fazer"]],
    ["Como usar IA Para Prospectar Clientes com Estratégia: captar cliente e captação e o que caracteriza captação de clientes", "como captar um cliente", []],
    ["Como o que explica melhor: tráfego pago ou orgânico", "trafego organico e pago", []],
    ["Trafego organico e pago: o que considerar sobre vantagens e qual a diferença entre", "trafego organico e pago", []],
    /* Só a repetição da raiz de um lado do dois-pontos no outro. */
    ["Como captar cliente: captar clientes sem anúncios", "como captar um cliente", []],
  ];
  for (const [titulo, principal, complementares] of PICOTADOS) assert.equal(radarWritingTitleIsFragmented(titulo, [principal, ...complementares]), true, titulo);
  const LEGITIMOS: Array<[string, string]> = [
    ["Como montar a rotina de skincare facial: controlar o brilho e escolher produtos", "skincare facial"],
    ["6 skin care nivea para comparar", "skin care nivea"],
    ["Tráfego pago vs orgânico para clínica de estética: como reduzir dependência de anúncios", "trafego organico e pago"],
    ["Skincare facial: o que fazer na prática", "skincare facial"],
    ["Tráfego pago e tráfego orgânico: qual escolher", "tráfego pago e tráfego orgânico"],
  ];
  for (const [titulo, principal] of LEGITIMOS) assert.equal(radarWritingTitleIsFragmented(titulo, [principal]), false, titulo);

  /* O caso real: título picotado, bloco "Atrair cliente e clientes" com a primeira subseção repetindo a pergunta, e o fechamento picotado. */
  const modelo = modeloAtrair();
  const filha = { ...modelo.sections[0], id: "section:filha", level: 3 as const, headingSuggestion: "O que caracteriza a captação de clientes?", readerQuestion: "O que é a captação de clientes?", coveragePoints: ["características da captação de clientes"], childSections: [] };
  const bloco = { ...modelo.sections[0], id: "section:bloco", headingSuggestion: "Atrair cliente e clientes", readerQuestion: "O que é a captação de clientes?", coveragePoints: [], childSections: [filha] };
  const picotado: RadarEditorialArticleModel = {
    ...modelo,
    titleSuggestion: PICOTADOS[0][0],
    titleAlternatives: ["Como atrair cliente e praticidade", "Como atrair um cliente: atrair clientes e fazer um pitch de vendas eficiente? guia para converter clientes"],
    sections: [...modelo.sections, bloco],
    conclusion: { ...modelo.conclusion, synthesis: "Retomar a resposta principal: atrair cliente e praticidade." },
  };
  const linha = linhaDe(entradaDoArtigo(picotado, ATRAIR, COMPLEMENTARES_ATRAIR));
  CSVS.push(csvDe(linha));
  assert.match(linha.row.titulo_e_seo, /^H1 de trabalho: não definido — formule a partir da promessa e da estrutura, com a keyword principal \("como atrair um cliente"\)\.$/m);
  assert.doesNotMatch(linha.row.titulo_e_seo, /praticidade|pitch/i, "nenhuma alternativa picotada");
  const estrutura = linha.row.estrutura;
  assert.doesNotMatch(estrutura, /Atrair cliente e clientes/);
  assert.equal(titulos(estrutura).filter(titulo => /O que é a captação de clientes\?$/.test(titulo)).length, 1, "a subseção que repete a pergunta sai no bloco");
  assert.match(estrutura, /## O que é a captação de clientes\?\n- Cobrir: características da captação de clientes/);
  assert.match(estrutura, /^Fechamento: Retomar a resposta principal \(a da abertura\) em poucas linhas, sem repetir o texto\.$/m);
  assert.doesNotMatch(linha.row.promessa_e_leitor, /atrair cliente e praticidade/);
});

/* ============================== (4) uma régua só para o "não cobrir" ============================== */

const pergunta = (canonicalQuestion: string, pages = 2) => ({ canonicalQuestion, status: "MARKET_QUESTION_UNDERCOVERED", pages, sampleSize: 12, declaredByArticle: false, evidence: `${pages} de 12` });

test("P0-B (4) · o que está no 'Não cobrir' sai de H2/H3 e do 'Cobrir:' — o rótulo fora do escopo e a pergunta de outro tópico do Silo", () => {
  /* Leads: "Como identificar um lead qualificado na prática" era H2 e estava no "Não cobrir" (toca "Como qualificar um lead na prática?"). */
  sequencia = 0;
  const leads = buildRadarEditorialArticleModel({
    context: contextoDoArtigo("leads qualificados", ["gerar leads qualificados", "captação de leads qualificados"]),
    observed: observadoComConcorrentes(["www.rdstation.com", "www.exactsales.com.br"]),
    blueprint: blueprintDe([
      candidato("O que é um lead qualificado?", 17),
      candidato("Como identificar um lead qualificado na prática", 6),
      candidato("Como medir resultados em geração de leads", 6),
    ], "leads qualificados"),
  });
  const comForaDoEscopo = { ...leads, candidates: [...leads.candidates, { id: "fora-1", observedLabel: "Como qualificar um lead na prática?", pages: 1, sampleSize: 23, dnaAligned: false, dnaRequired: false, intentFit: true, verdict: "OUT_OF_SCOPE" as const, reason: "O ArticleDNA não declara este assunto e ele não toca a composição de keywords: pertence a outro artigo.", sectionId: null }] };
  const linhaLeads = linhaDe(entradaDoArtigo(comForaDoEscopo, "leads qualificados", ["gerar leads qualificados", "captação de leads qualificados"]));
  CSVS.push(csvDe(linhaLeads));
  assert.doesNotMatch(linhaLeads.row.estrutura, /identificar um lead qualificado na prática/i);
  assert.match(linhaLeads.row.estrutura, /^Uma seção ficou de fora porque trata de assunto da lista "Não cobrir" \(coluna cobrir_e_superar\)\.$/m);
  assert.match(linhaLeads.row.cobrir_e_superar, /- "Como qualificar um lead na prática\?": /);

  /* Tráfego: "como funciona o tráfego vindo de ferramentas de IA" no "Cobrir:" e a pergunta mandada a outro tópico do Silo. */
  sequencia = 0;
  const trafego = buildRadarEditorialArticleModel({
    context: contextoDoArtigo("trafego organico e pago", ["tráfego orgânico"]),
    observed: observadoComConcorrentes(["www.rockcontent.com", "www.hostinger.com.br"]),
    blueprint: blueprintDe([
      candidato("O que é tráfego orgânico?", 17),
      candidato("Como funciona o tráfego orgânico?", 6, ["Como funciona o tráfego orgânico?"]),
      candidato("Como funciona o tráfego vindo de ferramentas de IA?", 2),
    ], "trafego organico e pago"),
  });
  const base = entradaGoogle();
  const observado = structuredClone(base.googleObserved) as unknown as Record<string, unknown>;
  observado.questions = [
    pergunta("Como fazer tráfego orgânico?"), pergunta("Como medir o tráfego orgânico?"), pergunta("Como gerar tráfego pago?"),
    pergunta("Como funciona o tráfego vindo de ferramentas de IA?"), pergunta("Qual a diferença entre tráfego orgânico e pago?"),
  ];
  const silo: RadarSiloExportWritingContext = {
    kind: "silo", label: "Leads sem Tráfego Pago", partial: true, draft: false, centralEntity: "Leads sem Tráfego Pago", objective: null, audience: null,
    macroProblem: null, dominantIntent: null, whyTogether: null, boundary: null,
    includedTopics: ["trafego pago como funciona", "tráfego orgânico"], excludedTopics: [], siloPage: null,
    members: [{ articleId: ARTIGO, position: 1, title: "trafego organico e pago", principalKeyword: "trafego organico e pago", slug: "trafego-pago-vs-organico", role: "Suporte", statusLabel: "finalizado", inThisFile: true, reason: null }],
  } as RadarSiloExportWritingContext;
  const linhaTrafego = linhaDe(entradaDoArtigo(trafego, "trafego organico e pago", ["tráfego orgânico"], { googleObserved: observado as never, dossierGaps: base.dossierGaps ? { ...base.dossierGaps, observed: observado as never } : null }), { ...AVULSO, topRowLabel: "Silo", silo });
  CSVS.push(csvDe(linhaTrafego));
  assert.match(linhaTrafego.row.cobrir_e_superar, /^- "Como funciona o tráfego vindo de ferramentas de IA\?": pertence a "trafego pago como funciona", outro tópico do Silo; não responder aqui\.$/m);
  assert.doesNotMatch(linhaTrafego.row.estrutura, /ferramentas de IA/i, "o mesmo item não fica como seção nem como ponto a cobrir");

  /* O mesmo item, pela régua: três quartos das raízes; "captar clientes" não sai por causa de outro item maior. */
  assert.equal(radarWritingSameItem("como prospectar clientes pela Internet em 8 passos", "Como prospectar clientes pela Internet em 8 passos?"), true);
  assert.equal(radarWritingSameItem("qual a importância de definir o Perfil do Cliente Ideal (ICP)", "Qual a importância de definir o Perfil do Cliente Ideal (ICP)?"), true);
  assert.equal(radarWritingSameItem("captar clientes", "Como captar clientes para atacado de açaí e alavancar seu negócio"), false);
  assert.equal(radarWritingSameItem("Como prospectar clientes da forma certa", "Como prospectar clientes pela Internet em 8 passos"), false);
});

/* ============================== (5) o ruído de pesquisa ============================== */

const fonte = (destinationUrl: string, ancora: string, sinal: string) => ({ destinationUrl, anchors: [ancora], domain: new URL(destinationUrl).hostname, sourceType: "unknown", authoritySignals: [sinal], sections: ["Conteúdo"], competitorsUsingIt: 1 });
const OFICIAL = "domínio oficial ou regulador";
const EDUCACIONAL = "domínio educacional ou institucional";

test("P1 (5) · fontes do mercado, perguntas, PAA, abertura e temas sem o ruído de pesquisa; os temas sobre a lista impressa", () => {
  const base = entradaGoogle();
  const observado = structuredClone(base.googleObserved) as unknown as Record<string, unknown> & { externalSources: Record<string, unknown>; competitors: Array<Record<string, unknown>> };
  observado.externalSources = {
    ...observado.externalSources,
    evidenceCandidates: [
      fonte("https://cookiedatabase.org/tcf/purposes/", "Leia mais sobre esses objetivos", EDUCACIONAL),
      fonte("https://fin.org.br/selo-fin-de-prevencao-a-fraudes", "Clique aqui para entender sobre a certificação Fin Antifraude do Efí Bank", EDUCACIONAL),
      fonte("https://loja.spcbrasil.org.br/consulta/pessoa-fisica", "Consultar CPF", EDUCACIONAL),
      fonte("https://emec.mec.gov.br/emec/consulta-cadastro/detalhamento/d96957f455f6405d14c6542552b0f6eb/MTc4NTQ=", "QR-Code para a aplicação do e-MEC", OFICIAL),
      fonte("https://www.w3.org/WAI/tutorials/images/decision-tree/", "Descreva a finalidade da imagem (abrir em uma nova aba)", EDUCACIONAL),
      fonte("https://ecidade.campinagrande.pb.gov.br/games.php/jogo-da-fortuna-tiger", "jogo da fortuna tiger jogo da fortuna tiger Games 4.3 ★", OFICIAL),
      fonte("http://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12527.htm", "LAI", OFICIAL),
      fonte("https://www.gov.br/cvm/pt-br/canais_atendimento/consultas-reclamacoes-denuncias", "Atendimento CVM", OFICIAL),
      fonte("https://pt.wikipedia.org/wiki/Custo_de_aquisi%C3%A7%C3%A3o_de_clientes", "Custo de Aquisição de Cliente", EDUCACIONAL),
    ],
  };
  observado.questions = [
    pergunta("O que fazer para atrair clientes?", 4), pergunta("Deseja receber e-mails com novos eventos e conteúdos exclusivos?", 3),
    pergunta("Como atrair clientes nos primeiros 30 dias da loja virtual?", 3), pergunta("Como é o processo entre Pacientes e Psicólogo?", 2),
    pergunta("Como conseguir leads qualificados: conclusão", 2), pergunta("Como um CRM pode ajudar a atrair clientes?", 2),
  ];
  observado.aiDiscovery = null;
  /* A lista impressa: as 12 comparáveis da bancada. Os esboços: elas mais outras 11 páginas, e o menu repetido de um site. */
  const comparaveis = (base.dossierGaps!.observed as unknown as { competitors: Array<{ url: string; domain: string; comparable: boolean }> }).competitors.filter(item => item.comparable);
  assert.ok(comparaveis.length >= 6, "a bancada tem a lista de comparáveis");
  const esboco = (url: string, domain: string, headings: string[]): RadarCompetitorOutlinePage => ({ url, title: domain, domain, headings: headings.map(text => ({ level: 2, text })) });
  const MENU = "Soluções de dados para personalizar campanhas de marketing";
  const outlines = [
    ...comparaveis.map((item, indice) => esboco(item.url, item.domain, ["Faça parcerias", "Invista no atendimento", ...(indice < 2 ? [MENU] : [])])),
    ...Array.from({ length: 11 }, (_, indice) => esboco(`https://fora-${indice}.com.br/blog/x`, `fora-${indice}.com.br`, ["Faça parcerias"])),
    esboco(`${comparaveis[0].url}-outra`, comparaveis[0].domain, [MENU]),
  ];
  const entrada = entradaDoArtigo(modeloAtrair(), ATRAIR, COMPLEMENTARES_ATRAIR, {
    googleObserved: observado as never,
    dossierGaps: base.dossierGaps ? { ...base.dossierGaps, observed: { ...base.dossierGaps.observed, externalSources: observado.externalSources } as never } : null,
    competitorOutlines: outlines,
    serpObserved: base.serpObserved ? {
      ...base.serpObserved,
      snapshot: base.serpObserved.snapshot ? { ...base.serpObserved.snapshot, peopleAlsoAsk: [{ question: "Qual o segredo para atrair clientes?" }, { question: "É possível ganhar Cashback em compras nas marcas de Estética?" }] } as never : base.serpObserved.snapshot,
    } as never : base.serpObserved,
  });
  const linha = linhaDe(entrada);
  CSVS.push(csvDe(linha));
  const fontes = linha.row.fontes_e_especialista;
  for (const ruido of [/cookiedatabase/, /fin\.org\.br/, /spcbrasil/, /emec/, /w3\.org/, /fortuna tiger/, /planalto\.gov\.br/, /gov\.br\/cvm/]) assert.doesNotMatch(fontes, ruido, String(ruido));
  assert.match(fontes, /Custo de Aquisição de Cliente — https:\/\/pt\.wikipedia\.org\//, "a fonte que toca o tema fica");

  const cobrir = linha.row.cobrir_e_superar;
  assert.match(cobrir, /^- O que fazer para atrair clientes\?/m);
  assert.match(cobrir, /^- Como um CRM pode ajudar a atrair clientes\?/m);
  for (const ruido of [/receber e-mails/, /loja virtual/, /Psicólogo/, /: conclusão/]) assert.doesNotMatch(cobrir, ruido, String(ruido));
  assert.doesNotMatch(linha.row.promessa_e_leitor, /receber e-mails|loja virtual/);

  const serp = linha.row.serp_resumida;
  assert.match(serp, /^Pessoas também perguntam: Qual o segredo para atrair clientes\?$/m, "o PAA sem o cashback de consumidor");
  assert.match(serp, new RegExp(`O que os concorrentes lidos cobrem \\(H2/H3 das ${comparaveis.length} páginas comparáveis, de \\d+ site\\(s\\); `), "uma base só: a lista impressa");
  assert.doesNotMatch(serp, /Soluções de dados para personalizar/, "o menu repetido no mesmo site não é tema");
  assert.match(serp, new RegExp(`^- Parcerias · ${comparaveis.length} de \\d+ sites · `, "m"), "a recorrência conta sites da lista impressa, não as 11 páginas de fora");
});

/* ============================== (6) e (7) o especialista e o CTA ============================== */

const E1_SINTESE = "É frustrante se esforçar para chamar atenção e receber apenas curtidas ou perguntas de quem mora longe demais para ser atendido. Sua divulgação precisa mostrar o serviço, a região e o cuidado que existe no seu trabalho. Eu organizo essas informações no site da clínica, com páginas de serviços e conteúdos que respondem às dúvidas de quem está considerando marcar uma consulta…";
const E1_INTEIRA = "É frustrante se esforçar para chamar atenção e receber apenas curtidas ou perguntas de quem mora longe demais para ser atendido. Sua divulgação precisa mostrar o serviço, a região e o cuidado que existe no seu trabalho. Eu organizo essas informações no site da clínica, com páginas de serviços e conteúdos que respondem às dúvidas de quem está considerando marcar uma consulta. Assim, quem chega ao site já sabe o que você faz, onde atende e como agendar.";

const especialistaCta = (contribution: string, fullAnswer: string) => ({
  state: "RECEIVED" as const, note: "", pending: 0, rejected: 0,
  items: [{
    requirementQuestion: "Que argumento o especialista usa para o chamado à ação deste artigo", questionsSent: [],
    contribution, fullAnswer, classification: "Opinião profissional", status: "Aceita como apoio", approved: true,
    appliesTo: "Chamada final", quote: null, kind: "CTA",
    limitations: ["Esta contribuição foi marcada como APOIO: ela orienta o texto, e não sustenta afirmação factual sozinha."],
  }],
});

const SILO_ATRAIR = (siloPage: RadarSiloExportWritingContext["siloPage"] = { slug: "leads-sem-trafego-pago", canonical: "https://adalbapro.com.br/leads-sem-trafego-pago", publishedUrl: null, status: "nova, ainda não publicada" }): RadarSiloExportWritingContext => ({
  kind: "silo", label: "Leads sem Tráfego Pago", partial: true, draft: false, centralEntity: "Leads sem Tráfego Pago", objective: null, audience: null,
  macroProblem: null, dominantIntent: null, whyTogether: null, boundary: null, includedTopics: [], excludedTopics: [], siloPage,
  members: [
    { articleId: "pilar-1", position: 1, title: "leads qualificados", principalKeyword: "leads qualificados", slug: "qualificados", role: "Pilar", statusLabel: "fora desta seleção", inThisFile: false, reason: null },
    { articleId: ARTIGO, position: 2, title: ATRAIR, principalKeyword: ATRAIR, slug: "como-atrair-um-cliente", role: "Suporte", statusLabel: "neste arquivo", inThisFile: true, reason: null },
    { articleId: "sup-3", position: 3, title: "como captar um cliente", principalKeyword: "como captar um cliente", slug: "como-captar-um-cliente", role: "Suporte", statusLabel: "fora desta seleção", inThisFile: false, reason: null },
  ],
} as RadarSiloExportWritingContext);

test("P1 (6) e (7) · a resposta aprovada sai inteira; um CTA só, e o próximo artigo como continuação com link só se aprovado", () => {
  assert.equal(radarWritingApprovedAnswer({ contribution: E1_SINTESE, fullAnswer: E1_INTEIRA }), E1_INTEIRA);
  assert.equal(radarWritingApprovedAnswer({ contribution: "Síntese organizada pela IA, outro texto.", fullAnswer: E1_INTEIRA }), "Síntese organizada pela IA, outro texto.", "a síntese organizada é a aprovada");
  assert.equal(radarWritingApprovedAnswer({ contribution: "é possível gerar leads com trafego orgânico sim", fullAnswer: "é possível gerar leads com trafego orgânico sim" }), "é possível gerar leads com trafego orgânico sim");

  const entrada = entradaDoArtigo(modeloAtrair(), ATRAIR, COMPLEMENTARES_ATRAIR, { specialistContext: especialistaCta(E1_SINTESE, E1_INTEIRA) });
  const semLink = linhaDe(entrada, { ...AVULSO, topRowLabel: "Silo", silo: SILO_ATRAIR() });
  CSVS.push(csvDe(semLink));
  const promessa = linhas(semLink.row.promessa_e_leitor);
  const chamadas = promessa.filter(item => /^Chamada final/.test(item));
  assert.equal(chamadas.length, 1, "uma chamada só");
  assert.ok(chamadas[0].includes("Assim, quem chega ao site já sabe o que você faz, onde atende e como agendar"), "a resposta aprovada, inteira");
  assert.doesNotMatch(chamadas[0], /marcar uma consulta…/);
  assert.match(chamadas[0], /^Chamada final \(a única do artigo\) — argumento do especialista, inteiro: "/);
  assert.equal(promessa.some(item => /^Próximo passo do leitor/.test(item)), false);
  assert.ok(promessa.includes(`Continuação (não é uma segunda chamada): no fechamento, apresente o próximo artigo do Silo, "como captar um cliente", como a leitura seguinte ${RADAR_WRITING_NO_APPROVED_LINK}.`), promessa.join("\n"));
  assert.doesNotMatch(semLink.row.promessa_e_leitor, /SiloPage/, "a SiloPage não vira segunda saída");
  /* Na coluna de fontes, a remissão — sem repetir nem cortar o texto. */
  assert.match(semLink.row.fontes_e_especialista, /E1 · Pergunta: "Que argumento o especialista usa para o chamado à ação deste artigo" · Resposta aprovada: inteira na coluna promessa_e_leitor · Aplicar em: chamada final \(CTA\)/);
  assert.doesNotMatch(semLink.row.fontes_e_especialista, /…/);

  /* Com o link aprovado para o próximo artigo, a continuação leva o L dele. */
  const observado = structuredClone(entrada.googleObserved) as unknown as Record<string, unknown> & { internalLinkPlan: Record<string, unknown> };
  observado.internalLinkPlan = { ...observado.internalLinkPlan, outgoing: [
    { nodeId: "article:sup-3", slug: "como-captar-um-cliente", approvedAnchorConcepts: ["como conquistar clientes novos"], relationTypes: ["SUPPORT_TO_SUPPORT"], targetRole: "support", anchor: { recommendedAnchor: "como conquistar clientes novos" }, preferredContexts: [], distribution: [], reason: "continuação" },
  ] };
  const comLink = linhaDe({ ...entrada, googleObserved: observado as never }, { ...AVULSO, topRowLabel: "Silo", silo: SILO_ATRAIR() });
  assert.match(comLink.row.promessa_e_leitor, /^Continuação \(não é uma segunda chamada\): no fechamento, apresente o próximo artigo do Silo, "como captar um cliente", como a leitura seguinte, com o link L1\.$/m);

  /* O último da ordem: a SiloPage é a continuação. */
  const ultimo = SILO_ATRAIR();
  ultimo.members = ultimo.members.slice(0, 2);
  assert.match(linhaDe(entrada, { ...AVULSO, topRowLabel: "Silo", silo: ultimo }).row.promessa_e_leitor, /^Continuação \(não é uma segunda chamada\): no fechamento, apresente a SiloPage "Leads sem Tráfego Pago" como a leitura seguinte \(cite sem link: /m);
});

/* ============================== (8) e (9) os links do Pilar e a publicação dos irmãos ============================== */

const MEMBROS_DO_PILAR: Array<[string, string, string]> = [
  ["sup-instagram", "instagram não traz pacientes", "como atrair clientes pelo instagram"],
  ["sup-atrair", "como atrair um cliente", "como atrair mais clientes"],
  ["sup-captar", "como captar um cliente", "como conquistar clientes novos"],
  ["sup-trafego", "tráfego pago vs orgânico para clínica de estética", "aquisição de tráfego pago e orgânico"],
  ["sup-captacao", "captação de pacientes sem tráfego pago", "captação de pacientes dentista"],
  ["sup-promocoes", "promoções para estética", "ofertas e promoções para atrair pacientes"],
  ["sup-campanhas", "campanhas de marketing para clínica de estética sem anúncios", "campanhas de marketing"],
];

function entradaDoPilar(membros: ReadonlyArray<[string, string, string]> = MEMBROS_DO_PILAR): RadarPortableExportInput {
  sequencia = 0;
  const modelo = buildRadarEditorialArticleModel({
    context: contextoDoArtigo("leads qualificados", ["gerar leads qualificados", "lista de leads qualificados"]),
    observed: observadoComConcorrentes(["www.rdstation.com", "www.exactsales.com.br", "www.agendor.com.br"]),
    blueprint: blueprintDe([
      candidato("O que é um lead qualificado?", 17),
      candidato("Por que gerar leads qualificados?", 5),
      candidato("Campanhas que geram leads qualificados", 3),
      candidato("Qual a diferença entre lead qualificado e lead interessado?", 4),
      candidato("Taxa de leads qualificados", 3),
    ], "leads qualificados"),
  });
  const base = entradaGoogle();
  const observado = structuredClone(base.googleObserved) as unknown as Record<string, unknown> & { internalLinkPlan: Record<string, unknown>; internalLinks: Record<string, unknown> };
  observado.internalLinkPlan = {
    ...observado.internalLinkPlan,
    outgoing: membros.map(([id, , ancora]) => ({
      nodeId: `article:${id}`, slug: null, approvedAnchorConcepts: [ancora], relationTypes: ["PILLAR_TO_SUPPORT"], targetRole: "support",
      anchor: { recommendedAnchor: ancora }, preferredContexts: ["Seção que desenvolve \"O que é um lead qualificado?\" — 17 de 23 página(s) da amostra tratam do assunto."], distribution: [], reason: "O Pilar abre a verticalização.",
    })),
  };
  observado.internalLinks = { ...observado.internalLinks, relatedInternalPages: membros.map(([id, rotulo]) => ({ nodeId: `article:${id}`, label: rotulo, slug: null })) };
  return entradaDoArtigo(modelo, "leads qualificados", ["gerar leads qualificados", "lista de leads qualificados"], { googleObserved: observado as never });
}

const SILO_DO_PILAR = (): RadarSiloExportWritingContext => ({
  kind: "silo", label: "Leads sem Tráfego Pago", partial: true, draft: false, centralEntity: "Leads sem Tráfego Pago", objective: null, audience: null,
  macroProblem: null, dominantIntent: null, whyTogether: null, boundary: null, includedTopics: [], excludedTopics: [], siloPage: null,
  members: [
    { articleId: ARTIGO, position: 1, title: "leads qualificados", principalKeyword: "leads qualificados", slug: "qualificados", role: "Pilar", statusLabel: "neste arquivo", inThisFile: true, reason: null },
    ...MEMBROS_DO_PILAR.map(([articleId, rotulo], indice) => ({ articleId, position: indice + 2, title: rotulo, principalKeyword: rotulo, slug: rotulo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-"), role: "Suporte", statusLabel: "fora desta seleção", inThisFile: false, reason: null })),
  ],
} as RadarSiloExportWritingContext);

test("P1 (8) · Pilar: os links vão às seções que tratam o destino, e nenhuma seção leva todos", () => {
  const linha = linhaDe(entradaDoPilar(), { ...AVULSO, topRowLabel: "Silo", silo: SILO_DO_PILAR() });
  CSVS.push(csvDe(linha));
  const links = linhas(linha.row.links_internos).filter(item => /^L\d · /.test(item));
  assert.equal(links.length, 7, linha.row.links_internos);
  const porSecao = new Map<string, number>();
  for (const item of links) {
    const onde = item.match(/ · onde: seção "([^"]+)"/)?.[1];
    assert.ok(onde, `link sem seção: ${item}`);
    porSecao.set(onde!, (porSecao.get(onde!) || 0) + 1);
  }
  assert.ok(Math.max(...porSecao.values()) <= 2, JSON.stringify([...porSecao]));
  assert.ok(porSecao.size >= 4, "espalhados pelas seções");
  /* O destino de campanhas vai à seção que trata de campanha. */
  assert.match(links.find(item => item.includes("âncora \"campanhas de marketing\""))!, /onde: seção "Campanhas que geram leads qualificados"/, `${linha.row.estrutura}\n${linha.row.links_internos}`);
  /* Cada seção da estrutura nomeia os seus L. */
  const estrutura = linha.row.estrutura;
  const rotulos = [...estrutura.matchAll(/^- Links: (.+)\.$/gm)].flatMap(item => item[1].split(", "));
  assert.deepEqual(rotulos.sort(), ["L1", "L2", "L3", "L4", "L5", "L6", "L7"]);

  /* Um link só, com lugar no plano: sem excesso, ele vai à seção que trata o destino, e não ao ponto genérico do plano. */
  const umSo = linhaDe(entradaDoPilar(MEMBROS_DO_PILAR.slice(-1)), { ...AVULSO, topRowLabel: "Silo", silo: SILO_DO_PILAR() });
  assert.match(umSo.row.links_internos, /^L1 · âncora "campanhas de marketing" .* · onde: seção "Campanhas que geram leads qualificados" · /m, umSo.row.links_internos);
});

test("P1 (9) · a publicação de todos os membros do Silo: destino publicado sai com a URL, mesmo fora do arquivo", async () => {
  const publicacoes = new Map<string, RadarWritingPublication>([
    ["sup-instagram", { published: true, publishedUrl: "https://adalbapro.com.br/leads-sem-trafego-pago/instagram-nao-traz-pacientes", canonical: null, slug: "instagram-nao-traz-pacientes", principalPolicy: "revisable" }],
    ["sup-trafego", { published: true, publishedUrl: "https://adalbapro.com.br/leads-sem-trafego-pago/trafego-pago-vs-organico-para-clinica-de-estetica", canonical: null, slug: "trafego-pago-vs-organico-para-clinica-de-estetica", principalPolicy: "revisable" }],
    ["sup-captar", { published: false, publishedUrl: null, canonical: null, slug: "como-captar-um-cliente", principalPolicy: null }],
  ]);
  const linha = linhaDe(entradaDoPilar(), { ...AVULSO, topRowLabel: "Silo", silo: SILO_DO_PILAR(), siloPublications: publicacoes });
  CSVS.push(csvDe(linha));
  const links = linha.row.links_internos;
  assert.match(links, /→ Suporte "instagram não traz pacientes" → https:\/\/adalbapro\.com\.br\/leads-sem-trafego-pago\/instagram-nao-traz-pacientes \(publicado\)/);
  assert.match(links, /→ Suporte "tráfego pago vs orgânico para clínica de estética" → https:\/\/adalbapro\.com\.br\/leads-sem-trafego-pago\/trafego-pago-vs-organico-para-clinica-de-estetica \(publicado\)/);
  assert.match(links, /→ Suporte "como captar um cliente" → \/como-captar-um-cliente \(destino ainda não publicado: /, "o que não está no ar continua dito");

  /* No lote: o mapa de publicações chega à linha de cada artigo e à ordem narrativa do topo. */
  const lote = radarPortableWritingExport({
    articles: montadasDoSiloSaude(), lenses: LEITURA_DAS_LENTES, plan: planoDoSilo(), today: EXPORTADO_EM,
    publications: new Map([[ARTIGO_AMAZON, { published: true, publishedUrl: "https://careglow.com.br/skin-care-nivea", canonical: null, slug: "skin-care-nivea", principalPolicy: "locked" }]]),
  });
  const csv = lote.files![0].csv;
  assert.match(csv, /âncora ""produtos nivea para a pele"" → Suporte ""skin care nivea"" → https:\/\/careglow\.com\.br\/skin-care-nivea \(publicado\)/);

  /* O núcleo resolve a publicação dos irmãos do ArticleDNA que o lote já leu, e só lê a página dos artigos do arquivo. */
  const nucleo = await readFile(new URL("../lib/server/radar-portable-export-core.ts", import.meta.url), "utf8");
  assert.match(nucleo, /for \(const versao of artefatos\.articles\) \{/);
  assert.match(nucleo, /if \(!atual \|\| versao\.versionNumber > atual\.versionNumber\) versaoMaisNova\.set/);
  assert.match(nucleo, /filter\(\(\[articleId, item\]\) => doArquivo\.has\(articleId\) && item\.published && item\.publishedUrl\)/);
});

/* ============================== (10) promoções ============================== */

const H2_PROMOCOES = [
  "O erro é usar desconto como resposta para tudo em promoções para estética",
  "Ideias de promoções para estética com mais critério comercial",
  "Instagram ajuda na lembrança, mas não substitui presença quando o paciente procura",
  "Promoção sem base local vira barulho",
  "Como criar promoções sem desvalorizar a clínica",
  "Quando a promoção revela um problema maior",
  "Por que escolher a AdalbaPro em vez de uma agência comum?",
];

test("P1 (10) · promoções: sem estrutura do modelo e com a página publicada lida, a referência é a publicada, sem bloquear; a intenção divergente é decisão do Arquiteto", () => {
  const base = entradaGoogle();
  const observado = structuredClone(base.googleObserved) as unknown as Record<string, unknown>;
  observado.conflicts = [{ subject: "Intenção de busca", dimension: "intent", articleSide: "transacional", observedSide: "ofertas e cupons para o consumidor", evidence: "O artigo declara \"transacional\" e a SERP responde com ofertas ao consumidor.", impact: "" }];
  const modelo = { ...base.articleModel!, sections: [], titleSuggestion: "Promoções estética: o que fazer na prática", titleAlternatives: [] };
  const entrada: RadarPortableExportInput = {
    ...base,
    article: { ...base.article, principalKeyword: "promoções estética", secondaryKeywords: ["promoções para estética"], mustCover: [], audience: "Responsável por clínica de estética.", slug: "promocoes-para-estetica" },
    articleModel: modelo as never,
    googleObserved: observado as never,
  };
  const publicacao: RadarWritingPublication = {
    published: true, publishedUrl: "https://adalbapro.com.br/leads-sem-trafego-pago/promocoes-para-estetica", canonical: "https://adalbapro.com.br/leads-sem-trafego-pago/promocoes-para-estetica",
    slug: "promocoes-para-estetica", principalPolicy: "revisable",
    currentStructure: { h1: "Promoções para estética: quando o desconto atrai curioso e destrói margem", h2: H2_PROMOCOES, updatedAt: null },
  };
  const linha = linhaDe(entrada, { ...AVULSO, publication: publicacao });
  CSVS.push(csvDe(linha));
  assert.notEqual(linha.verdict, "Não", linha.row.pode_escrever);
  assert.doesNotMatch(linha.row.pode_escrever, /não produziu estrutura/);
  assert.match(linha.row.estrutura, /^Estrutura de referência: a da página publicada \(lida da página na exportação\)\./);
  for (const h2 of H2_PROMOCOES) assert.ok(linha.row.estrutura.includes(`## ${h2}`), h2);
  assert.match(linha.row.pode_escrever, /a SERP de "promoções estética" responde a outra intenção \(ofertas e cupons para o consumidor\) e o ArticleDNA declara transacional para responsável por clínica de estética: trocar a principal ou a intenção é decisão do Arquiteto; escreva pela intenção e pelo leitor declarados/);
  assert.match(linha.row.prompt, /^Escreva em português do Brasil o artigo descrito nesta linha/, "o prompt é de escrita, não de bloqueio");

  /* Sem a página lida, o bloqueio de antes continua. */
  const semPagina = linhaDe(entrada, { ...AVULSO, publication: { ...publicacao, currentStructure: null } });
  assert.equal(semPagina.verdict, "Não");
});

/* ============================== D10 · o CSV inteiro ============================== */

test("D10 · os CSVs de ponta a ponta deste arquivo saem sem as palavras proibidas", () => {
  assert.ok(CSVS.length >= 8, `os testes acima geraram ${CSVS.length} CSV(s)`);
  for (const csv of CSVS) {
    const texto = doExport(csv);
    for (const proibida of D10) assert.doesNotMatch(texto, proibida, `${proibida} em: ${texto.match(new RegExp(`.{0,80}${proibida.source}.{0,80}`, "i"))?.[0]}`);
  }
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
