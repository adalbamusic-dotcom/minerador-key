import assert from "node:assert/strict";
import test from "node:test";
import { buildRadarEditorialArticleModel, type RadarEditorialArticleModel } from "../lib/radar/editorial-article-model.ts";
import type { RadarEditorialBlueprint, RadarSectionCandidate } from "../lib/radar/editorial-blueprint.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarCompetitiveObservedModel } from "../lib/radar/competitive-observed-model.ts";
import { radarCompetitorHeadingIsNoise, radarCompetitorHeadingIsNotTopic, radarCompetitorTopics } from "../lib/radar/competitor-topics.ts";
import {
  radarCompetitorHeadingPostTitleReason,
  radarMarketCitationNoiseReason,
  radarReaderQuestionNoiseReason,
  radarResearchOtherProfession,
  radarResearchStoreNoise,
} from "../lib/radar/research-noise.ts";
import { radarEditorialHeadingNoiseReason } from "../lib/radar/editorial-article-model.ts";
import { radarOutOfScopeDistinctiveStems } from "../lib/radar/out-of-scope.ts";
import {
  buildRadarWritingExportArticle,
  type RadarWritingArticleContext,
  type RadarWritingExportArticle,
} from "../lib/radar/portable-writing-export.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import {
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarArticleBlueprintColumns,
  radarArticleBlueprintForbiddenScene,
  radarArticleBlueprintPendingNotes,
  radarArticleBlueprintPrompt,
  radarArticleBlueprintSectionRefsByTitle,
  radarArticleBlueprintTextForbiddenScene,
  radarArticleBlueprintTextWithoutForbiddenScene,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintBrief,
  type RadarArticleBlueprintPayload,
} from "../lib/radar/article-blueprint.ts";
import type { RadarWritingPublication } from "../lib/radar/portable-writing-export.ts";
import { radarArticleBlueprintFreezeOf, radarArticleBlueprintPanelChoice, radarArticleBlueprintPanelStateLabel } from "../modules/radar/radar-article-blueprint-panel.tsx";
import { radarArticleBlueprintExportChoice } from "../lib/server/radar-article-blueprint-read.ts";
import { ARTIGO, ARTIGO_AMAZON, ARTIGO_NAO_ENVIADO, entradaAmazon, entradaGoogle, planoDoSilo } from "./radar-portable-writing-fixtures.mts";

/*
 * ===== 2026-10-08 · CORREÇÃO DA RODADA DOS 8 CSVs "PARA ESCREVER" =====
 *
 * Os achados da revisão (casos reais e suítes) que se confirmaram no código.
 * Cada teste falha no código anterior à correção e passa depois. As fixtures
 * imitam os casos reais (cabeçalhos, perguntas e textos copiados dos CSVs do
 * dono); o resto é inventado. Sem rede, sem provider: PROVIDER_CALLS = 0.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const linhas = (texto: string) => texto.split("\n");
const titulos = (estrutura: string) => linhas(estrutura).filter(linha => /^#{2,3} /.test(linha));

/* ============================== o modelo editorial da SERP ============================== */

const AMOSTRA = 10;
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

const contextoDoArtigo = (principal: string, complementares: string[] = [], topicos: string[] = [], contentType: string | null = null): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "marca-1", articleId: ARTIGO, articleDnaVersionId: "dna-v1", articleDnaContentHash: "hash-dna-v1",
    promise: null, mainIntent: "informacional", hierarchy: "Suporte", ...(contentType ? { contentType } : {}),
    classification: { intent: "INFORMATIONAL", intentLabel: "Informacional", funnel: "TOP", funnelLabel: "Topo", reason: "Fechado pelo Arquiteto." },
  },
  keywords: [principal, ...complementares].map((text, indice) => ({ identity: { keywordId: `kw-${indice}`, role: indice ? "secundaria" : "principal", text } })),
  editorialTopics: [principal, ...complementares, ...topicos],
  resolvedKeywordTexts: [principal, ...complementares],
  silo: null, formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const observado = (): RadarCompetitiveObservedModel => ({
  sample: { comparablePages: AMOSTRA, uniqueReferences: 10, analyzedSuccess: AMOSTRA, failedFinal: 0 },
  concepts: { all: [], recurrent: [], confirmed: [], undercovered: [], isolated: [] },
  structure: { measures: [], presences: [], patterns: [] },
  questions: [], entities: { primary: [], related: [] }, gaps: [], differentiations: [], conflicts: [],
  competitors: [], internalLinkPlan: { outgoing: [], siloPage: null },
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

function modelo(principal: string, secoes: RadarSectionCandidate[], opcoes: { complementares?: string[]; topicos?: string[]; contentType?: string | null } = {}): RadarEditorialArticleModel {
  return buildRadarEditorialArticleModel({
    context: contextoDoArtigo(principal, opcoes.complementares || [], opcoes.topicos || [], opcoes.contentType ?? null),
    observed: observado(),
    blueprint: blueprintDe(secoes, principal),
  });
}

const AVULSO: RadarWritingArticleContext = { topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: null };

function entradaDoArtigo(modeloDoArtigo: RadarEditorialArticleModel, principal: string, complementares: string[] = [], extra: Partial<RadarPortableExportInput> = {}): RadarPortableExportInput {
  const base = entradaGoogle();
  return {
    ...base,
    article: {
      ...base.article, principalKeyword: principal, secondaryKeywords: complementares, mustCover: [principal, ...complementares],
      slug: principal.replace(/\s+/g, "-"), siloName: null, articleRole: "support", promise: null,
    },
    articleModel: modeloDoArtigo,
    internalLinks: [],
    ...extra,
  };
}

const linhaDe = (entrada: RadarPortableExportInput, contexto: RadarWritingArticleContext = AVULSO): RadarWritingExportArticle => buildRadarWritingExportArticle(entrada, contexto);

const foraDoEscopo = (observedLabel: string) => ({
  id: `fora-${observedLabel}`, observedLabel, pages: 1, sampleSize: AMOSTRA, dnaAligned: false, dnaRequired: false, intentFit: true,
  verdict: "OUT_OF_SCOPE" as const, reason: "O ArticleDNA não declara este assunto e ele não toca a composição de keywords: pertence a outro artigo.", sectionId: null,
});

/* ============================== R1 · a principal com o ano ============================== */

test("R1 · principal com o ano: o cabeçalho com o MESMO ano não é 'conteúdo datado' — o modelo tem seções e o CSV não bloqueia", () => {
  const PRINCIPAL = "tendências de marketing digital 2026";
  const comAno = ["Tendências de marketing digital para 2026", "O que muda no marketing digital em 2026?", "Inteligência artificial no marketing em 2026"];
  for (const cabecalho of comAno) assert.equal(radarCompetitorHeadingIsNoise(cabecalho, { core: [PRINCIPAL] }), false, cabecalho);
  /* Sem ano no núcleo, o ano continua datando o cabeçalho (C5). */
  assert.equal(radarCompetitorHeadingIsNoise("Tendências de marketing digital para 2026", { core: ["marketing digital para clínicas"] }), true);

  sequencia = 0;
  const modeloDoAno = modelo(PRINCIPAL, [candidato(comAno[0], 7), candidato(comAno[1], 5), candidato(comAno[2], 4)]);
  assert.deepEqual(modeloDoAno.candidates.map(item => item.verdict), ["PROMOTED", "PROMOTED", "PROMOTED"], modeloDoAno.candidates.map(item => `${item.observedLabel}: ${item.reason}`).join(" | "));
  assert.ok(modeloDoAno.sections.length >= 2, "o modelo tem seções");
  const linha = linhaDe(entradaDoArtigo(modeloDoAno, PRINCIPAL));
  assert.doesNotMatch(linha.row.pode_escrever, /não produziu estrutura/);
  assert.ok(titulos(linha.row.estrutura).length >= 2, linha.row.estrutura);

  /* Os temas dos concorrentes também ficam. */
  const pagina = (dominio: string) => ({ url: `https://${dominio}/blog/x`, title: dominio, domain: dominio, headings: comAno.map(text => ({ level: 2, text })) });
  const temas = radarCompetitorTopics({ pages: [pagina("www.rdstation.com"), pagina("www.hubspot.com"), pagina("www.rockcontent.com")], core: [PRINCIPAL] });
  assert.ok(temas.topics.length >= 1, "os cabeçalhos com o ano da principal viram tema");
});

/* ============================== R2 e F3 · o "Não cobrir" tira a seção só pelo mesmo item ============================== */

test("R2 · uma palavra em comum com um rótulo fora do escopo não tira a seção promovida; o mesmo item tira", () => {
  const PRINCIPAL = "como atrair pacientes para clínica de estética";
  sequencia = 0;
  const base = modelo(PRINCIPAL, [
    candidato("Como atrair pacientes para clínica de estética?", 8),
    candidato("Como usar o Instagram para atrair pacientes?", 6),
    candidato("Indicação de pacientes: como pedir?", 5),
  ]);
  const comFora: RadarEditorialArticleModel = { ...base, candidates: [...base.candidates, foraDoEscopo("Instagram para restaurantes")] };
  const linha = linhaDe(entradaDoArtigo(comFora, PRINCIPAL));
  assert.ok(titulos(linha.row.estrutura).some(titulo => /Instagram para atrair pacientes/.test(titulo)), linha.row.estrutura);
  assert.doesNotMatch(linha.row.estrutura, /ficou de fora porque trata de assunto da lista "Não cobrir"/);
  assert.match(linha.row.cobrir_e_superar, /"Instagram para restaurantes"/, "o rótulo continua no Não cobrir");

  /* O mesmo item (o rótulo é a seção) sai, e isso é dito. */
  const mesmo: RadarEditorialArticleModel = { ...base, candidates: [...base.candidates, foraDoEscopo("Como usar o Instagram para atrair pacientes")] };
  const semSecao = linhaDe(entradaDoArtigo(mesmo, PRINCIPAL));
  assert.doesNotMatch(semSecao.row.estrutura, /Instagram para atrair pacientes/);
  assert.match(semSecao.row.estrutura, /^Uma seção ficou de fora porque trata de assunto da lista "Não cobrir" \(coluna cobrir_e_superar\)\.$/m);
});

test("F3 · só a pergunta do leitor tocava o 'Não cobrir': sai a pergunta, a seção fica pelo cabeçalho; 'outros' e 'estratégia' não distinguem", () => {
  /* O caso real de tráfego: "E os outros canais orgânicos?" tirava "tipos de tráfego orgânico" (pela raiz "outr"). */
  const PRINCIPAL = "trafego organico e pago";
  assert.deepEqual(radarOutOfScopeDistinctiveStems("E os outros canais orgânicos?", [PRINCIPAL]).filter(raiz => /^outr/.test(raiz)), []);
  assert.deepEqual(radarOutOfScopeDistinctiveStems("Como usar os 4 Ps do marketing em sua estratégia", ["campanhas de marketing"]).filter(raiz => /^estrateg/.test(raiz)), []);

  sequencia = 0;
  const base = modelo(PRINCIPAL, [
    candidato("O que é tráfego orgânico?", 9),
    candidato("Tipos de tráfego orgânico", 5, ["Quais são os outros tipos de tráfego?"]),
  ]);
  const comFora: RadarEditorialArticleModel = { ...base, candidates: [...base.candidates, foraDoEscopo("E os outros canais orgânicos?")] };
  const linha = linhaDe(entradaDoArtigo(comFora, PRINCIPAL));
  assert.ok(titulos(linha.row.estrutura).some(titulo => /tipos de tráfego/i.test(titulo)), linha.row.estrutura);
  assert.doesNotMatch(linha.row.estrutura, /ficou de fora porque trata de assunto da lista "Não cobrir"/);

  /* A pergunta que é o MESMO item do "Não cobrir" sai sozinha: a seção fica, titulada pelo cabeçalho sem molde. */
  sequencia = 0;
  const comPergunta = modelo(PRINCIPAL, [
    candidato("O que é tráfego orgânico?", 9),
    candidato("Tipos de tráfego orgânico", 5, ["Como funciona o tráfego vindo de ferramentas de IA?"]),
  ]);
  const comPerguntaFora: RadarEditorialArticleModel = { ...comPergunta, candidates: [...comPergunta.candidates, foraDoEscopo("Como funciona o tráfego vindo de ferramentas de IA?")] };
  const estrutura = linhaDe(entradaDoArtigo(comPerguntaFora, PRINCIPAL)).row.estrutura;
  assert.ok(titulos(estrutura).some(titulo => /^## Tipos de tráfego orgânico$/.test(titulo)), estrutura);
  assert.doesNotMatch(estrutura, /ferramentas de IA/);
});

/* ============================== R3 · os blocos do Amazon ============================== */

test("R3 · os blocos do Amazon ('Conclusão', 'Comparação resumida') não passam pela régua de cabeçalho de concorrente", () => {
  const entrada = entradaAmazon(true);
  const modeloDoPerfil = entrada.profileModel as unknown as { blocks: Array<Record<string, unknown>> };
  const bloco = (id: string, order: number, heading: string, objective: string) => ({
    id, order, heading, objective, coveragePoints: [], function: "Bloco comercial", evidenceStrength: "MODERATE",
    mustCoverReasons: [], sourceNeeded: null, specialistRequired: null, visualOpportunity: null, sourceSignal: "Bloco do formato.",
  });
  entrada.profileModel = {
    ...modeloDoPerfil,
    blocks: [
      modeloDoPerfil.blocks[0],
      bloco("comparacao", 2, "Comparação resumida", "Colocar as opções lado a lado por faixa de preço e nota de avaliação."),
      bloco("perfis", 3, "Para quem cada opção faz sentido", "Ligar cada opção a uma necessidade concreta do leitor."),
      bloco("fim", 4, "Conclusão", "Fechar com a escolha que os critérios sustentam, e dizer o que ficou em aberto."),
    ],
  } as never;
  const estrutura = linhaDe(entrada, { ...AVULSO, articleId: ARTIGO_AMAZON }).row.estrutura;
  assert.match(estrutura, /^## Conclusão$/m, estrutura);
  assert.match(estrutura, /Fechar com a escolha que os critérios sustentam/);
  assert.doesNotMatch(estrutura, /Uma seção do modelo da SERP ficou de fora/);
});

/* ============================== F1, F2, F6, F7, F14 · a planta no CSV ============================== */

const NIVEA_NO_AR = "https://careglow.com.br/cuidados-com-a-pele/skin-care-nivea";
const publicacao = (url: string | null): RadarWritingPublication => ({ published: Boolean(url), publishedUrl: url, canonical: url, slug: null, principalPolicy: null });
const esqueletoM = (id: string, heading: string) => ({ id, level: 2 as const, parent: null, heading, readerQuestion: null, cover: [], mustCover: false, needsSource: false, needsSpecialist: false, outOfScope: false });

function pacoteDaPlanta(): RadarArticleBlueprintBrief {
  return {
    article: {
      principal: "skincare facial", complementary: [], subject: null, intent: "Informacional", funnel: "Topo", siloRole: "Pilar",
      audience: null, promise: null, slug: "skincare-facial", publishedUrl: null, mustCover: [], unit: { type: "article", label: "Artigo", format: null },
    },
    silo: null,
    skeleton: [esqueletoM("M1", "Rotina da manhã"), esqueletoM("M2", "Máscaras faciais"), esqueletoM("M3", "Anúncios de cosméticos"), esqueletoM("M4", "Hidratação noturna")],
    skeletonFrame: { workingTitle: null, promise: null, closing: null },
    evidence: [{ id: "P1", kind: "pergunta da amostra", text: "Como fazer skincare facial? (4 de 6 páginas)" }],
    linkCandidates: [
      { id: "K1", label: "skin care nivea", role: "Suporte", destination: "/skin-care-nivea", status: "PLANNED", fromGraph: true },
      { id: "K2", label: "máscara facial", role: "Suporte", destination: "/mascara-facial", status: "PLANNED", fromGraph: true },
    ],
    graphLinks: [], sources: [], unsupportedClaims: [], specialist: [], videos: [], outOfScope: [], competitorTitles: [],
    measures: { comparablePages: 0, words: { median: null, p25: null, p75: null }, h2: null, h3: null, paragraphs: null, images: null, lists: null },
    authors: [], brandVoice: null,
  } as unknown as RadarArticleBlueprintBrief;
}

const secaoDaIa = (h2: string, extra: Record<string, unknown> = {}) => ({ h2, readerQuestion: `${h2}?`, answerFirst: "Resposta direta.", from: ["M1"], ...extra });
const respostaDaPlanta = (patch: Record<string, unknown> = {}) => ({
  keywordPlan: { reading: "A principal no H1.", complementary: [] },
  reader: "Quem começa a cuidar da pele.", promise: "Uma rotina possível.",
  angle: { statement: "Uma rotina curta, por etapa.", evidence: [] },
  title: { h1: "Skincare facial: a rotina por etapa", seoTitle: "Skincare facial", metaDescription: "A rotina por etapa." },
  opening: { readerQuestion: "Como fazer skincare facial?", direction: "Responder direto.", evidence: ["P1"] },
  sections: [
    secaoDaIa("A rotina da manhã em três passos", {
      from: ["M1"], internalLinks: [{ candidate: "K1", anchor: "skin care nivea" }],
      explain: ["Mostre o que a pessoa vê ao longo das semanas, como antes e depois, rotinas reais e produtos de farmácia.", "Explique a ordem dos produtos."],
    }),
    secaoDaIa("Máscaras faciais na semana", { from: ["M2"], internalLinks: [{ candidate: "K2", anchor: "máscara facial" }, { candidate: "K1", anchor: "skin care nivea" }] }),
    secaoDaIa("Quando procurar quem atende", { from: ["P1"] }),
  ],
  discarded: [{ id: "M3", reason: "Anúncios de cosméticos são mídia paga, já coberta na seção 8." }, { id: "M4", reason: "A hidratação da noite entra na seção 2, junto com as máscaras faciais." }],
  closing: { turn: "A rotina simples vence a complicada.", cta: "Conheça os protocolos da clínica.", nextStep: "Agende uma avaliação na página de serviços." },
  visual: [
    { slot: "CAPA", section: null, concept: "Bancada com frascos", prompt: "Bancada de banheiro com frascos, luz natural. Proporção 16:9.", alt: "Bancada", caption: "" },
    { slot: "R1", section: "1", concept: "", prompt: "Mãos aplicando sérum, sem rosto. Proporção 4:3.", alt: "Sérum", caption: "" },
    { slot: "R2", section: "2", concept: "", prompt: "Máscara de argila num pote. Proporção 4:3.", alt: "Máscara", caption: "" },
  ],
  ...patch,
});

const plantaAntiga = (patch: Record<string, unknown> = {}): RadarArticleBlueprintPayload => {
  const { payload } = radarSanitizeArticleBlueprint(RadarArticleBlueprintAiSchema.parse(respostaDaPlanta(patch)), pacoteDaPlanta());
  /* Como foi gravada: o texto e o descarte como a IA os escreveu (a conferência de então não os tocava). */
  const gravada = JSON.parse(JSON.stringify(payload)) as RadarArticleBlueprintPayload;
  const crua = respostaDaPlanta(patch) as { sections: Array<{ explain?: string[] }>; discarded: Array<{ id: string; reason: string }> };
  gravada.blueprint.sections = gravada.blueprint.sections.map((secao, indice) => ({ ...secao, explain: crua.sections[indice]?.explain ?? secao.explain }));
  gravada.blueprint.discarded = crua.discarded;
  return { ...gravada, approval: "APPROVED" as const };
};

const contextoDoSilo = (publicacoes: Map<string, RadarWritingPublication>, blueprint: RadarArticleBlueprintPayload): RadarWritingArticleContext => ({
  topRowLabel: "Silo", filePosition: 1, silo: planoDoSilo().files[0].writing!, articleId: ARTIGO, publication: null, blueprint, siloPublications: publicacoes,
});

test("F1 · o irmão do Silo no ar sai PUBLICADO na planta (URL e '(publicado)'); o cabeçalho de destino planejado só fica com destino ainda não publicado", () => {
  const planta = plantaAntiga();
  assert.deepEqual(planta.linkCandidates.map(item => item.status), ["PLANNED", "PLANNED"], "a planta gravou os irmãos como planejados");
  const comUmNoAr = linhaDe(entradaGoogle(), contextoDoSilo(new Map([[ARTIGO_AMAZON, publicacao(NIVEA_NO_AR)]]), planta)).row.links_internos;
  assert.match(comUmNoAr, new RegExp(`^L1 · âncora "skin care nivea" → Suporte "skin care nivea" → ${NIVEA_NO_AR.replace(/[./]/g, "\\$&")} \\(publicado\\)`, "m"), comUmNoAr);
  assert.match(comUmNoAr, /^L2 · âncora "máscara facial" → Suporte "máscara facial".*planejado/m);
  assert.match(comUmNoAr, /^Destino planejado \(ainda não publicado\)/m, "a máscara facial ainda não está no ar");

  const todosNoAr = linhaDe(entradaGoogle(), contextoDoSilo(new Map([
    [ARTIGO_AMAZON, publicacao(NIVEA_NO_AR)],
    [ARTIGO_NAO_ENVIADO, publicacao("https://careglow.com.br/cuidados-com-a-pele/mascara-facial")],
  ]), planta)).row.links_internos;
  assert.doesNotMatch(todosNoAr, /Destino planejado|ainda não publicado|planejado:/, todosNoAr);
  assert.match(todosNoAr, /mascara-facial \(publicado\)/);

  /* Na geração, o irmão no ar já entra na planta como destino publicado. */
  const brief = buildRadarArticleBlueprintBrief({
    entrada: entradaGoogle(), silo: planoDoSilo().files[0].writing!, articleId: ARTIGO, publication: null,
    siloPublications: new Map([[ARTIGO_AMAZON, publicacao(NIVEA_NO_AR)]]),
  });
  const nivea = brief.linkCandidates.find(item => item.label === "skin care nivea")!;
  assert.deepEqual([nivea.status, nivea.destination], ["PUBLISHED", NIVEA_NO_AR]);
  const mascara = brief.linkCandidates.find(item => /m[aá]scara facial/i.test(item.label))!;
  assert.equal(mascara.status, "PLANNED");
});

test("F2 e F14 · a planta no CSV traz UMA chamada: o 'Próximo passo' vira a continuação para o próximo artigo do Silo, com o link da planta; o link repetido sai", () => {
  const estrutura = linhaDe(entradaGoogle(), contextoDoSilo(new Map([[ARTIGO_AMAZON, publicacao(NIVEA_NO_AR)]]), plantaAntiga())).row.estrutura;
  assert.equal((estrutura.match(/^CTA/gm) || []).length, 1, estrutura);
  assert.doesNotMatch(estrutura, /^Próximo passo:/m);
  assert.doesNotMatch(estrutura, /Agende uma avaliação na página de serviços/);
  assert.match(estrutura, /^Continuação \(não é uma segunda chamada\): no fechamento, apresente o próximo artigo do Silo, "skin care nivea", como a leitura seguinte, com o link L1\.$/m);
  /* F14 · "skin care nivea" → K1 aparecia duas vezes: sai uma (na primeira seção), e a medida concorda. */
  assert.equal((estrutura.match(/- Link interno: âncora "skin care nivea"/g) || []).length, 1);
  assert.match(estrutura, / · 2 links internos · /);
  const links = linhaDe(entradaGoogle(), contextoDoSilo(new Map(), plantaAntiga())).row.links_internos;
  assert.match(links, /^Aplique somente estes 2 link\(s\)/m, links);
  assert.doesNotMatch(links, /^L3 /m);

  /* Sem link da planta para o próximo: citado sem link. A chamada do especialista, quando ele é CTA, é a única. */
  const semLink = plantaAntiga({ sections: [secaoDaIa("A rotina da manhã em três passos", { from: ["M1"] }), secaoDaIa("Máscaras faciais na semana", { from: ["M2"] }), secaoDaIa("Quando procurar quem atende", { from: ["P1"] })] });
  const colunas = radarArticleBlueprintColumns(semLink, null, null, null, {
    continuation: { kind: "article", label: "skin care nivea", articleId: ARTIGO_AMAZON, slug: "skin-care-nivea", names: ["skin care nivea"] },
    specialistCta: "\"Comece pela rotina simples e marque uma avaliação.\" (E1; atribuir como fala do especialista, sem inventar nome ou credencial)",
  });
  assert.match(colunas.estrutura, /^Continuação \(não é uma segunda chamada\): no fechamento, apresente o próximo artigo do Silo, "skin care nivea", como a leitura seguinte \(cite sem link: o grafo aprovado não traz esse link; não crie o link\)\.$/m);
  assert.match(colunas.estrutura, /^CTA \(a única chamada\) — argumento do especialista, inteiro: "Comece pela rotina simples e marque uma avaliação\." \(E1;/m);
  assert.doesNotMatch(colunas.estrutura, /Conheça os protocolos da clínica|^Próximo passo:/m);
  /* Sem as opções novas (outros consumidores), a planta sai como antes. */
  assert.match(radarArticleBlueprintColumns(semLink).estrutura, /^Próximo passo: Agende uma avaliação na página de serviços\.$/m);
});

test("F6 · antes e depois no TEXTO da planta: o export tira só o trecho; a conferência pede a troca (sem fechar) ou tira (fechando)", () => {
  const real = "Publique conteúdo que ajude o paciente a decidir, como antes e depois, depoimentos e explicações de procedimentos.";
  assert.equal(radarArticleBlueprintTextForbiddenScene(real), "ANTES_E_DEPOIS");
  assert.equal(radarArticleBlueprintTextWithoutForbiddenScene(real), "Publique conteúdo que ajude o paciente a decidir, como depoimentos e explicações de procedimentos.");
  assert.equal(radarArticleBlueprintTextWithoutForbiddenScene("Use depoimentos reais e antes e depois."), "Use depoimentos reais.");
  assert.equal(radarArticleBlueprintTextWithoutForbiddenScene("Mostre o antes e depois da paciente."), null, "a cena é o núcleo da frase: a frase sai");
  assert.equal(radarArticleBlueprintTextWithoutForbiddenScene("Explique a rotina. Mostre o antes e depois da paciente."), "Explique a rotina.");
  assert.equal(radarArticleBlueprintTextWithoutForbiddenScene("Não use antes e depois: explique o processo."), "Não use antes e depois: explique o processo.", "a menção negada fica");
  /* Resultado do procedimento é assunto de texto (só a imagem não pode prometê-lo). */
  assert.equal(radarArticleBlueprintTextForbiddenScene("Explique que o resultado do procedimento depende da avaliação."), null);

  const estrutura = radarArticleBlueprintColumns(plantaAntiga(), null, null, null, { principal: "skincare facial" }).estrutura;
  assert.ok(linhas(estrutura).includes("- Explicar: Mostre o que a pessoa vê ao longo das semanas, como rotinas reais e produtos de farmácia."), estrutura);
  assert.doesNotMatch(estrutura, /antes e depois/);

  const semFechar = radarSanitizeArticleBlueprint(RadarArticleBlueprintAiSchema.parse(respostaDaPlanta()), pacoteDaPlanta());
  const nota = semFechar.notes.find(item => /manda escrever antes e depois/.test(item));
  assert.ok(nota && radarArticleBlueprintPendingNotes([nota]).pending.length === 1, "a nota pede ação (dispara a passada de correção)");
  const fechada = radarSanitizeArticleBlueprint(RadarArticleBlueprintAiSchema.parse(respostaDaPlanta()), pacoteDaPlanta(), { close: true });
  assert.deepEqual(fechada.payload.blueprint.sections[0].explain, ["Mostre o que a pessoa vê ao longo das semanas, como rotinas reais e produtos de farmácia.", "Explique a ordem dos produtos."]);
  assert.equal(radarArticleBlueprintPendingNotes(fechada.notes.filter(item => /antes e depois/.test(item))).pending.length, 0);
});

test("F7 · o 'seção N' do motivo do descarte vira o título (ou 'em outra seção' quando não resolve) — no export e na conferência", () => {
  const estrutura = radarArticleBlueprintColumns(plantaAntiga(), null, null, null, { principal: "skincare facial" }).estrutura;
  const descarte = linhas(estrutura).find(linha => linha.startsWith("Descartado do esqueleto da SERP:"))!;
  assert.match(descarte, /M3 "Anúncios de cosméticos" \(Anúncios de cosméticos são mídia paga, já coberta em outra seção\.\)/, descarte);
  assert.match(descarte, /M4 "Hidratação noturna" \(A hidratação da noite entra na seção "Máscaras faciais na semana", junto com as máscaras faciais\.\)/, descarte);
  assert.doesNotMatch(descarte, /seção \d/);
  assert.equal(radarArticleBlueprintSectionRefsByTitle("Tratado na seção 3, dentro do contexto de agências.", () => null), "Tratado em outra seção, dentro do contexto de agências.");

  /* Na conferência, o número é lido na ordem da IA: a FAQ que saiu não desloca a referência. */
  const { payload } = radarSanitizeArticleBlueprint(RadarArticleBlueprintAiSchema.parse(respostaDaPlanta({
    sections: [secaoDaIa("A rotina da manhã em três passos", { from: ["M1"] }), secaoDaIa("Perguntas frequentes sobre skincare", { from: ["M1"] }), secaoDaIa("Máscaras faciais na semana", { from: ["M2"] }), secaoDaIa("Quando procurar quem atende", { from: ["P1"] })],
    discarded: [{ id: "M4", reason: "Entra na seção 3." }],
  })), pacoteDaPlanta());
  assert.deepEqual(payload.blueprint.discarded, [{ id: "M4", reason: "Entra na seção \"Máscaras faciais na semana\"." }, ...payload.blueprint.discarded!.slice(1)]);
  const { system } = radarArticleBlueprintPrompt(pacoteDaPlanta());
  assert.match(system, /cite-a pelo título do H2, nunca pelo número/);
});

test("F10 e R8 · 'antes e após' é cena proibida; antes e depois e 'resultados reais' de MARKETING (feed, dashboard) não são", () => {
  assert.equal(radarArticleBlueprintForbiddenScene("Comparativo lado a lado do rosto da paciente antes e após o tratamento."), "ANTES_E_DEPOIS");
  assert.equal(radarArticleBlueprintForbiddenScene("Pele antes/após o peeling"), "ANTES_E_DEPOIS");
  assert.equal(radarArticleBlueprintForbiddenScene("Dashboard do Instagram com resultados reais de alcance e engajamento"), null);
  assert.equal(radarArticleBlueprintForbiddenScene("Comparação lado a lado do feed do Instagram antes e depois da estratégia de conteúdo"), null);
  /* Com contexto clínico, o mesmo feed continua proibido; e o post sem objeto de marketing também. */
  assert.equal(radarArticleBlueprintForbiddenScene("Feed do Instagram com o antes e depois do rosto da paciente"), "ANTES_E_DEPOIS");
  assert.equal(radarArticleBlueprintForbiddenScene("Exemplo de post estratégico com antes e depois"), "ANTES_E_DEPOIS");
  assert.equal(radarArticleBlueprintForbiddenScene("Conteúdo que mostra resultados reais ajuda na conversão."), "PROMESSA_VISUAL");
});

/* ============================== R7 e o painel · a mesma regra do export ============================== */

test("R7 · o painel aplica a regra do export: rascunho só pelo hash exato; a versão nova de outro ArticleDNA não vai; a antiga pelo relógio não afirma que vai", () => {
  const CONGELADO = "2026-10-01T12:00:00.000Z";
  const congelamento = { frozenAt: CONGELADO, bundleId: "bundle:f1", bundleHash: "aaaa1111", articleDnaVersionId: "dna-v2" };
  const ref = (articleDnaVersionId: string) => ({ frozenAt: CONGELADO, frozenBundleId: "bundle:f1", frozenBundleHash: "aaaa1111", articleDnaVersionId, articleDnaContentHash: null });
  type V = { id: string; versionNumber: number; state: "DRAFT" | "APPROVED"; origin: "ai" | "human_edit"; bundleHash?: string; createdAt?: string | null; payload?: unknown };
  const v = (id: string, numero: number, state: V["state"], hash: string, criada: string, investigationRef?: unknown): V =>
    ({ id, versionNumber: numero, state, origin: "ai", bundleHash: hash, createdAt: criada, payload: investigationRef ? { investigationRef } : {} });
  const investigacao = { frozenAt: CONGELADO, frozenBundleId: "bundle:f1", frozenBundleHash: "aaaa1111", articleDnaVersionId: "dna-v2", articleDnaContentHash: null, articleDnaFrom: "2026-09-01T00:00:00.000Z", articleDnaUntil: null };
  const doExport = (versoes: V[]) => radarArticleBlueprintExportChoice(versoes.map(item => ({ id: item.id, articleId: "a1", bundleHash: item.bundleHash!, versionNumber: item.versionNumber, state: item.state, createdAt: item.createdAt, investigationRef: (item.payload as { investigationRef?: unknown }).investigationRef })), new Map([["a1", "bundle-hash:ao-vivo"]]), new Map([["a1", investigacao]])).get("a1")?.id ?? null;

  /* (1) Rascunho antigo do mesmo congelamento, outro hash: o export não leva; o painel não o mostra como o que vai ao CSV. */
  const rascunho = [v("v1", 1, "DRAFT", "bundle-hash:antes", "2026-10-02T09:00:00+00:00")];
  assert.equal(doExport(rascunho), null);
  assert.equal(radarArticleBlueprintPanelChoice(rascunho, "aaaa1111", congelamento).shown, null);

  /* (2) Concluída do mesmo congelamento, organizada sobre OUTRO ArticleDNA: nem o export nem o painel. */
  const outroDna = [v("v2", 2, "APPROVED", "bundle-hash:antes", "2026-10-02T09:00:00+00:00", ref("dna-v1"))];
  assert.equal(doExport(outroDna), null);
  assert.equal(radarArticleBlueprintPanelChoice(outroDna, "aaaa1111", congelamento).shown, null);

  /* (3) Concluída antiga (sem a referência), pelo relógio: vai (o export confere o ArticleDNA); o painel não afirma. */
  const antiga = [v("v3", 3, "APPROVED", "bundle-hash:antes", "2026-10-02T09:00:00+00:00")];
  assert.equal(doExport(antiga), "v3");
  const escolhaAntiga = radarArticleBlueprintPanelChoice(antiga, "aaaa1111", congelamento);
  assert.equal(escolhaAntiga.shown?.id, "v3");
  assert.equal(escolhaAntiga.deliveryConfirmed, false);
  assert.equal(radarArticleBlueprintPanelStateLabel({ state: "APPROVED", origin: "ai" }, false, true), "Concluído — do congelamento vigente; vai aos entregáveis se o ArticleDNA não mudou desde a organização");

  /* (4) Concluída nova, com a referência do mesmo congelamento e do ArticleDNA da página: conferida. */
  const nova = [v("v4", 4, "APPROVED", "bundle-hash:antes", "2026-10-02T09:00:00+00:00", ref("dna-v2"))];
  assert.equal(doExport(nova), "v4");
  const escolhaNova = radarArticleBlueprintPanelChoice(nova, "aaaa1111", congelamento);
  assert.deepEqual([escolhaNova.shown?.id, escolhaNova.deliveryConfirmed], ["v4", true]);
  assert.deepEqual(radarArticleBlueprintFreezeOf({ frozenAt: CONGELADO, bundleId: "bundle:f1", bundleHash: "aaaa1111" }, "dna-v2"), congelamento);
});

/* ============================== R4 e R5 · o modelo editorial ============================== */

test("R4 · o tópico de cobertura declarado pelo humano continua exigindo ('tipos de pele', 'passo a passo da rotina'); a complementar só com verbo genérico não", () => {
  const PRINCIPAL = "rotina de skincare para pele oleosa";
  sequencia = 0;
  const comTopicos = modelo(PRINCIPAL, [
    candidato("Como montar a rotina de skincare para pele oleosa?", 8),
    candidato("Quais são os tipos de pele?", 1),
    candidato("Passo a passo da rotina noturna", 1),
  ], { topicos: ["tipos de pele", "passo a passo da rotina"] });
  const porRotulo = new Map(comTopicos.candidates.map(item => [item.observedLabel, item]));
  for (const rotulo of ["Quais são os tipos de pele?", "Passo a passo da rotina noturna"]) {
    assert.deepEqual([porRotulo.get(rotulo)?.verdict, porRotulo.get(rotulo)?.dnaRequired], ["PROMOTED", true], `${rotulo}: ${porRotulo.get(rotulo)?.reason}`);
  }
  /* A complementar que só acrescenta verbo genérico continua sem tornar nada obrigatório (P0-B). */
  sequencia = 0;
  const complementar = modelo("como atrair um cliente", [candidato("Como atrair um cliente?", 8), candidato("Como ganhar dinheiro com IA", 2)], { complementares: ["como ganhar um cliente"] });
  assert.notEqual(complementar.candidates.find(item => item.observedLabel === "Como ganhar dinheiro com IA")?.dnaRequired, true);
});

test("R5 · o modelo não tira chamada, fecho e navegação de oferta (dependem da unidade): a landing page os mantém; o artigo editorial os tira no CSV", () => {
  const PRINCIPAL = "limpeza de pele em são paulo";
  sequencia = 0;
  const lp = modelo(PRINCIPAL, [
    candidato("Limpeza de pele em São Paulo: como funciona", 7),
    candidato("Preço da limpeza de pele em São Paulo", 6),
    candidato("Fale com um especialista em limpeza de pele", 5),
  ]);
  assert.equal(lp.candidates.find(item => item.observedLabel === "Fale com um especialista em limpeza de pele")?.verdict, "PROMOTED");
  const entrada = entradaDoArtigo(lp, PRINCIPAL);
  const comoLanding = linhaDe({ ...entrada, article: { ...entrada.article, contentType: "landing_page" } }).row.estrutura;
  assert.match(comoLanding, /especialista em limpeza de pele/, comoLanding);
  const comoArtigo = linhaDe(entrada).row.estrutura;
  assert.doesNotMatch(comoArtigo, /Fale com um especialista/, comoArtigo);
});

/* ============================== F4, F9, F11, R6, R9 · a régua do ruído ============================== */

test("F4 · subtítulo de post no gerúndio ou no imperativo é título de post; 'X: qual escolher?' e 'X: captação ativa ou passiva?' continuam seção", () => {
  assert.equal(radarCompetitorHeadingPostTitleReason("Campanha de Inbound: Acelerando a geração de leads e oportunidades"), "título de post");
  assert.equal(radarCompetitorHeadingPostTitleReason("Como conquistar clientes: olhe para os problemas, focalize soluções"), "título de post");
  assert.equal(radarReaderQuestionNoiseReason("Como conquistar clientes: olhe para os problemas, focalize soluções"), "título de post");
  assert.equal(radarEditorialHeadingNoiseReason("Campanha de Inbound: Acelerando a geração de leads e oportunidades", { core: ["leads qualificados", "geração de leads qualificados"] }), "título de post");
  for (const fica of ["Botox x preenchimento: qual escolher?", "Captação de pacientes: ativa ou passiva?", "Tráfego pago: quando vale a pena?", "Leads: quando um contato vira oportunidade?"]) {
    assert.equal(radarCompetitorHeadingPostTitleReason(fica), null, fica);
  }
});

test("F9 · superstição sai das perguntas (e das buscas relacionadas); desligada quando o núcleo fala dela", () => {
  const ATRAIR = { core: ["como atrair um cliente", "atrair clientes"] };
  for (const pergunta of ["Qual é a oração poderosa para chamar clientes?", "O que é bom para chamar freguês?", "Simpatias para atrair clientes", "Como atrair clientes lei da atração", "Atrair clientes urgente"]) {
    assert.equal(radarReaderQuestionNoiseReason(pergunta, ATRAIR), "superstição", pergunta);
  }
  assert.equal(radarReaderQuestionNoiseReason("O que fazer para atrair clientes?", ATRAIR), null);
  assert.equal(radarReaderQuestionNoiseReason("Simpatias para atrair clientes funcionam?", { core: ["simpatias para atrair clientes"] }), null);
});

test("F11 · no artigo de promoção, vale-presente e oferta do dia são mecânicas da clínica; cupom a resgatar e cashback continuam saindo", () => {
  const PROMOCOES = { core: ["promoções estética", "promoções para estética"], audience: "Responsável por clínica de estética." };
  assert.equal(radarCompetitorHeadingIsNotTopic("Vale Presente", PROMOCOES), false);
  assert.equal(radarCompetitorHeadingIsNotTopic("Oferta do dia", PROMOCOES), false);
  assert.equal(radarResearchStoreNoise("Como resgatar o seu cupom", PROMOCOES), true);
  assert.equal(radarResearchStoreNoise("É possível ganhar cashback?", PROMOCOES), true);
  /* Fora do artigo de promoção, como antes. */
  assert.equal(radarResearchStoreNoise("Vale presente", { core: ["como atrair um cliente"], audience: "Dono de clínica." }), true);
});

test("R6 · órgão oficial e entidade que ranqueiam na SERP continuam fonte; o site comercial do concorrente sai", () => {
  const SAUDE = {
    core: ["toxina botulínica", "botox", "harmonização facial"], topics: ["Quem pode aplicar botox?"],
    competitorDomains: ["www.gov.br", "www.sbd.org.br", "clinicax.com.br"],
  };
  assert.equal(radarMarketCitationNoiseReason({ title: "Anvisa alerta sobre toxina botulínica falsificada", url: "https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2024/anvisa-alerta-sobre-toxina-botulinica-falsificada", domain: "www.gov.br", authorityClass: "domínio oficial ou regulador" }, SAUDE), null);
  assert.equal(radarMarketCitationNoiseReason({ title: "Toxina botulínica: indicações - SBD", url: "https://www.sbd.org.br/doencas/toxina-botulinica/", domain: "www.sbd.org.br", authorityClass: "domínio educacional ou institucional" }, SAUDE), null);
  assert.equal(radarMarketCitationNoiseReason({ title: "Pacotes de botox", url: "https://clinicax.com.br/pacotes/botox", domain: "clinicax.com.br", authorityClass: "NAO_CLASSIFICADA" }, SAUDE), "site do próprio concorrente");
  /* O oficial do mesmo domínio que não toca o tema continua saindo pela régua do tema. */
  assert.equal(radarMarketCitationNoiseReason({ title: "CVM", url: "https://www.gov.br/cvm/pt-br", domain: "www.gov.br", authorityClass: "domínio oficial ou regulador" }, SAUDE), "oficial fora do tema");
});

test("R9 · a pergunta de outra profissão que trata do assunto do núcleo fica ('Dentista pode aplicar botox?'); a que só divide o público sai", () => {
  const SAUDE = { core: ["toxina botulínica", "botox", "harmonização facial"] };
  assert.equal(radarReaderQuestionNoiseReason("Dentista pode aplicar botox?", SAUDE), null);
  assert.equal(radarResearchOtherProfession("Como é o processo entre Pacientes e Psicólogo?", { core: ["captação de pacientes dentista"] }), true);
  assert.equal(radarResearchOtherProfession("Marketing para psicólogos", { core: ["marketing para dentistas"] }), true);
});

/* ============================== F5, F8 e a ressalva de intenção · o CSV ============================== */

test("F5 · as buscas relacionadas passam pela régua do PAA: marca de concorrente e superstição saem da SERP resumida", () => {
  const base = entradaGoogle();
  /* O caso real de promoções: magote.com entre os concorrentes lidos. */
  const observado = structuredClone(base.googleObserved) as unknown as { competitors: Array<Record<string, unknown>> };
  observado.competitors = [{ ...observado.competitors[0], domain: "www.magote.com", url: "https://www.magote.com/promocoes" }, ...observado.competitors.slice(1)];
  const nome = "Magote";
  const serp = structuredClone(base.serpObserved) as NonNullable<RadarPortableExportInput["serpObserved"]> & { snapshot: { relatedSearches: Array<{ term: string; classification: null; notes: string }> } };
  serp.snapshot.relatedSearches = ["Skincare noturno", `${nome} promoção`, "Simpatias para atrair clientes", "Skincare para pele oleosa"].map(term => ({ term, classification: null, notes: "" }));
  const linha = linhaDe({ ...base, googleObserved: observado as never, serpObserved: serp });
  const relacionadas = linhas(linha.row.serp_resumida).find(item => item.startsWith("Buscas relacionadas"))!;
  assert.equal(relacionadas, "Buscas relacionadas (subtemas): Skincare noturno · Skincare para pele oleosa", linha.row.serp_resumida);
});

test("F8 · cabeçalho de FAQ não entra em 'Termos e temas a nomear'", () => {
  const PRINCIPAL = "trafego organico e pago";
  sequencia = 0;
  const base = modelo(PRINCIPAL, [candidato("O que é tráfego orgânico?", 9), candidato("Tipos de tráfego orgânico", 5)]);
  const entrada = entradaDoArtigo(base, PRINCIPAL);
  const observado = structuredClone(entrada.googleObserved) as unknown as { concepts: { all: Array<Record<string, unknown>> } };
  const conceito = (label: string) => ({ ...(observado.concepts.all[0] || {}), id: `c-${label}`, canonicalLabel: label, variants: [label], status: "RECURRENT", sourceCount: 4 });
  observado.concepts.all = ["Perguntas frequentes sobre tráfego orgânico", "Tráfego orgânico pago", "Tipos de tráfego orgânico", "Conteúdo de blog otimizado", "Busca orgânica local", "Palavras-chave de cauda longa"].map(conceito);
  const cobrir = linhaDe({ ...entrada, googleObserved: observado as never }).row.cobrir_e_superar;
  const termos = linhas(cobrir).find(item => item.startsWith("Termos e temas a nomear")) || "";
  assert.match(termos, /Palavras-chave de cauda longa/, cobrir);
  assert.doesNotMatch(termos, /Perguntas frequentes/, cobrir);
});

test("Ressalva de intenção: 'página de consumidor' só quando o lado observado é comercial ou de consumidor", () => {
  const conflito = (observedSide: string) => {
    const base = entradaGoogle();
    const observado = structuredClone(base.googleObserved) as unknown as Record<string, unknown>;
    observado.conflicts = [{ subject: "Intenção de busca", dimension: "intent", articleSide: "comercial", observedSide, evidence: "", impact: "" }];
    return linhaDe({ ...base, googleObserved: observado as never }).row.pode_escrever;
  };
  const informacional = conflito("guias informacionais");
  assert.match(informacional, /escreva pela intenção e pelo leitor declarados, sem copiar as páginas da SERP/, informacional);
  assert.doesNotMatch(informacional, /página de consumidor/);
  assert.match(conflito("8 de 10 resultados comerciais"), /sem copiar a página de consumidor/);
});

test("PROVIDER_CALLS = 0 nesta correção", () => {
  assert.deepEqual(idasAoServidor, []);
});
