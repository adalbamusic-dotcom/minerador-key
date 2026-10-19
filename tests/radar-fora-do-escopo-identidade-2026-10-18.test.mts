import assert from "node:assert/strict";
import test from "node:test";
import { buildRadarEditorialArticleModel, type RadarEditorialArticleModel } from "../lib/radar/editorial-article-model.ts";
import type { RadarEditorialBlueprint, RadarSectionCandidate } from "../lib/radar/editorial-blueprint.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarCompetitiveObservedModel } from "../lib/radar/competitive-observed-model.ts";
import { radarOutOfScopeMatcher, radarOutOfScopeOwner } from "../lib/radar/out-of-scope.ts";
import {
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintBrief,
} from "../lib/radar/article-blueprint.ts";
import { buildRadarWritingExportArticle, type RadarWritingArticleContext } from "../lib/radar/portable-writing-export.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import { ARTIGO, entradaGoogle, planoDoSilo } from "./radar-portable-writing-fixtures.mts";
import { comPlanta, respostaDaPlanta } from "./radar-piloto-planta-fixtures-2026-10-09.mts";

/*
 * ===== 2026-10-18 · A IDENTIDADE DO ARTIGO NUNCA É "FORA DO ESCOPO" (teste real local, WifiConecta) =====
 *
 * "Pesquisar e finalizar (7 artigos)" no Silo "Planos e contratação": as 7
 * investigações finalizaram e o artigo-modelo falhou com 422 em dois ("O
 * artigo-modelo da IA ficou com menos de três seções válidas"); um terceiro
 * concluiu jogando fora o próprio Assunto. As causas, com os rótulos reais:
 *
 *   1. "quantos mega de internet preciso" (978165e0): o rótulo genérico "Qual é
 *      a velocidade de internet ideal?" (2 de 30 páginas, fora do território
 *      pela régua de palavras: "velocidade" não está em keyword nenhuma) marcava
 *      fora do escopo a seção que a investigação PROMOVEU ("Como medir sua
 *      velocidade real", 6 de 30) e a OBRIGATÓRIA "Como a velocidade em Mega é
 *      distribuída…", e a conferência tirava toda seção da IA com "velocidade"
 *      — inclusive a "Virada para 300, 500, 600 Mega ou 1 Giga…" (pela pergunta).
 *   2. "claro vivo ou tim internet residencial" (85f9898f): "Qual é a operadora
 *      mais barata, Claro ou TIM?" ficava fora porque a raiz semântica não vê
 *      "TIM" (três letras); sobrava "operadora" como palavra distintiva, e toda
 *      seção da IA com "operadora" saía.
 *   3. "internet no meu cep" (1812e108, o artigo 04): pelo mesmo motivo ("CEP"),
 *      "Como Funciona a Busca de Internet por CEP?" ia ao "Não cobrir" do próprio
 *      artigo do CEP, e a pergunta-molde da virada ("O que o leitor desta BUSCA
 *      precisa entender…") levava o Assunto ao descarte "fora do escopo do pacote".
 *   4. Pilar e CEP: "Não sabe QUANTO tem de internet?" tirava "Quanto custa de
 *      fato…"; "O que analisar ANTES de CONTRATAR…" tirava "Como confirmar a
 *      disponibilidade antes de contratar".
 *
 * Os botões são os de sempre ("Pesquisar e finalizar", "Organizar o
 * artigo-modelo") → `generateRadarArticleBlueprint` → o pedido e a conferência
 * (`buildRadarArticleBlueprintBrief`, `radarSanitizeArticleBlueprint`). Nada de
 * porta nova. Sem rede, sem provider: PROVIDER_CALLS = 0.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ============================== a bancada do modelo da SERP ============================== */

const AMOSTRA = 30;
let sequencia = 0;

function candidato(titulo: string, paginas: number): RadarSectionCandidate {
  sequencia += 1;
  return {
    id: `candidate-${sequencia}`, conceptId: `concept-${sequencia}`, workingTitle: titulo, conceptTypeLabel: "Assunto",
    purpose: `Cobrir "${titulo}".`, priority: "RECOMMENDED", placement: "FLEXIBLE", placementReason: "",
    questions: [{ id: `q-${sequencia}`, text: titulo, priority: "RECOMMENDED", answerRequirement: "", marketStatement: "", factualSupport: "NOT_REQUIRED" }],
    definitions: [], entities: { primary: null, related: [] },
    marketEvidence: { pages: paginas, sampleSize: AMOSTRA, statement: `${paginas} de ${AMOSTRA}` },
    factualStatus: "NOT_REQUIRED", factualNote: "", specialistRequirementIds: [], internalLinks: [],
    videoOpportunityId: null, differentiation: null, limitations: [], provenance: [], confidence: "MEDIUM",
  } as unknown as RadarSectionCandidate;
}

type Artigo = { principal: string; secundarias: string[]; assunto: string; promessa: string; intencao: "Informacional" | "Comercial" };

/* Os ArticleDNA reais (texto das keywords, Assunto e detalhes do plano), sem ids. */
const QUANTOS_MEGA: Artigo = {
  principal: "quantos mega de internet preciso",
  secundarias: ["quantos mega de internet é bom", "quantos megas de internet é bom", "internet quantos mega", "quantos mega de internet", "1 giga de internet é quantos mega"],
  assunto: "300, 500, 600 Mega ou 1 Giga: quantos Mega você realmente precisa?",
  promessa: "Dimensionamento por pessoas, dispositivos simultâneos e atividades; upload e Wi-Fi",
  intencao: "Informacional",
};
const CLARO_VIVO_TIM: Artigo = {
  principal: "claro vivo ou tim internet residencial",
  secundarias: ["internet residencial vivo", "internet vivo fibra residencial", "claro residencial internet", "tim claro ou vivo", "tim residencial internet"],
  assunto: "Claro, Vivo ou TIM para casa: como comparar onde você mora",
  promessa: "Critérios condicionais por endereço, tecnologia, atendimento e contrato; provedores regionais",
  intencao: "Comercial",
};
const NO_MEU_CEP: Artigo = {
  principal: "internet no meu cep",
  secundarias: ["internet fibra no meu cep", "internet para meu cep", "internet disponível no meu cep", "melhor internet no meu cep", "internet no meu bairro"],
  assunto: "Como saber quais operadoras de internet atendem minha rua e meu CEP",
  promessa: "Diferença entre CEP e endereço completo, prédio, porta disponível e viabilidade técnica",
  intencao: "Informacional",
};
const PILAR: Artigo = {
  principal: "planos de internet residencial",
  secundarias: ["como escolher plano de internet residencial", "plano de internet residencial", "melhores planos de internet residencial", "melhor plano de internet residencial", "planos residencial"],
  assunto: "Como escolher um plano de internet residencial sem cair em uma oferta ruim",
  promessa: "Escolha de plano: cobertura, necessidade de uso, custo total, tecnologia, contrato e encaminhamento",
  intencao: "Informacional",
};

const contextoDe = (artigo: Artigo): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "marca-wificonecta", articleId: ARTIGO, articleDnaVersionId: "dna-v1", articleDnaContentHash: "hash-dna-v1",
    promise: artigo.promessa, mainIntent: artigo.intencao.toLowerCase(), hierarchy: "Suporte",
    classification: { intent: artigo.intencao === "Comercial" ? "COMMERCIAL_INVESTIGATION" : "INFORMATIONAL", intentLabel: artigo.intencao, funnel: "MIDDLE", funnelLabel: "Meio", reason: "Fechado pelo Arquiteto." },
    subject: { phrase: artigo.assunto, note: null, destinationUrl: null },
  },
  keywords: [artigo.principal, ...artigo.secundarias].map((text, indice) => ({
    identity: { keywordId: `kw-${indice}`, canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: null, role: indice ? "secundaria" : "principal", text },
    strategy: { volume: null, resultCount: null, kgrScore: null, incrementalVolume: null, contribution: null, normalizedIntent: null, coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: null, semanticQualification: null },
    resolution: "FULL", provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: null, keywordDnaContentHash: null },
  })),
  editorialTopics: [artigo.principal, ...artigo.secundarias, artigo.assunto],
  resolvedKeywordTexts: [artigo.principal, ...artigo.secundarias],
  silo: { siloId: "territory:planos-e-contratacao", siloName: "Planos e contratação" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const observado = (): RadarCompetitiveObservedModel => ({
  sample: { comparablePages: AMOSTRA, uniqueReferences: 30, analyzedSuccess: AMOSTRA, failedFinal: 0 },
  concepts: { all: [], recurrent: [], confirmed: [], undercovered: [], isolated: [] },
  structure: { measures: [], presences: [], patterns: [] },
  questions: [], entities: { primary: [], related: [] }, gaps: [], differentiations: [], conflicts: [],
  competitors: [], internalLinkPlan: { outgoing: [], siloPage: null },
  authorityEvidence: { specialistReviewRequirements: [] },
  aiDiscovery: { answerableUnits: [], definitionRequirements: [] },
  intent: { declared: "informacional", observedInSerp: "informacional" },
} as unknown as RadarCompetitiveObservedModel);

const blueprintDe = (secoes: RadarSectionCandidate[], principal: string): RadarEditorialBlueprint => ({
  article: { title: null, principal, objective: "Cobrir o tema.", intent: "Informacional", funnel: "Meio", siloRole: "SUPORTE" },
  opening: { directives: ["Responder diretamente."], evidence: "" }, sections: secoes,
  closing: { directives: [], evidence: "" }, essentialQuestions: [], entities: { primary: [], related: [] },
  differentiation: { marketCovers: [], underCovered: [], ownOpportunities: [] },
  unresolvedLinks: [], specialistBriefs: [], videoBriefs: [], limitations: [], readiness: { state: "PARTIAL", reason: "" },
} as unknown as RadarEditorialBlueprint);

function modelo(artigo: Artigo, candidatos: Array<[string, number]>): RadarEditorialArticleModel {
  sequencia = 0;
  return buildRadarEditorialArticleModel({
    context: contextoDe(artigo),
    observed: observado(),
    blueprint: blueprintDe(candidatos.map(([titulo, paginas]) => candidato(titulo, paginas)), artigo.principal),
  });
}

const veredito = (modeloDoArtigo: RadarEditorialArticleModel, rotulo: string) =>
  modeloDoArtigo.candidates.find(item => item.observedLabel === rotulo)?.verdict ?? null;

/* O candidato fora do escopo como o modelo real o deixou (o rótulo e o motivo de verdade). */
const foraDoEscopo = (observedLabel: string, pages = 1) => ({
  id: `fora-${observedLabel}`, observedLabel, pages, sampleSize: AMOSTRA, dnaAligned: false, dnaRequired: false, intentFit: true,
  verdict: "OUT_OF_SCOPE" as const, reason: "O ArticleDNA não declara este assunto e ele não toca a composição de keywords: pertence a outro artigo.", sectionId: null,
});

function entradaDe(artigo: Artigo, modeloDoArtigo: RadarEditorialArticleModel): RadarPortableExportInput {
  const base = entradaGoogle();
  return {
    ...base,
    article: {
      ...base.article, principalKeyword: artigo.principal, secondaryKeywords: artigo.secundarias, narrativeReinforcements: [],
      intent: artigo.intencao, mustCover: [artigo.principal, ...artigo.secundarias, artigo.assunto],
      slug: artigo.principal.replace(/\s+/g, "-"), siloName: "Planos e contratação", articleRole: "support", promise: artigo.promessa,
    },
    articleModel: modeloDoArtigo,
    researchContext: contextoDe(artigo),
    internalLinks: [],
  };
}

const pedidoDe = (entrada: RadarPortableExportInput): RadarArticleBlueprintBrief =>
  buildRadarArticleBlueprintBrief({ entrada, silo: null, articleId: ARTIGO, publication: null });

const idDoEsqueleto = (pedido: RadarArticleBlueprintBrief, padrao: RegExp) => {
  const item = pedido.skeleton.find(m => padrao.test(m.heading));
  assert.ok(item, `o esqueleto tem ${padrao}: ${pedido.skeleton.map(m => m.heading).join(" | ")}`);
  return item!;
};

/* ============================== 1 · a classificação ============================== */

/* Os cabeçalhos reais da amostra do artigo 04 (rótulo, páginas). */
const AMOSTRA_DO_CEP: Array<[string, number]> = [
  ["A Batalha pela Melhor Internet em Brasília", 10], ["Como identificar a melhor opção para o seu perfil", 4], ["Escolha seu plano de internet residencial", 4],
  ["Internet Residencial", 4], ["Vantagens da Fibra Óptica nos Bairros", 4], ["Perguntas Frequentes Sobre Internet por CEP", 3],
  ["Assistente Virtual de Internet Fibra", 2], ["Descubra em 30 segundos qual internet fibra passa na sua rua", 2],
  ["Disponibilidade internet com fibra", 2], ["Por Que a Internet Varia de Endereço para Endereço?", 2], ["O Risco: Internet via Rádio (WISP)", 2],
  ["Como Funciona a Busca de Internet por CEP?", 1], ["Como usar a nossa ferramenta para buscar internet por CEP:", 1],
  ["É possível economizar contratando internet por CEP?", 1], ["Qual é a internet mais rápida em Espírito Santo?", 1],
  ["Sua internet está entregando o que promete?", 1], ["Qual a velocidade ideal de internet?", 1],
];

test("CEP e TIM: a sigla da identidade conta no território — o próprio assunto deixa de ser 'fora do escopo'; o que é de outro artigo continua", () => {
  const doCep = modelo(NO_MEU_CEP, AMOSTRA_DO_CEP);
  for (const proprio of ["Como Funciona a Busca de Internet por CEP?", "Como usar a nossa ferramenta para buscar internet por CEP:", "É possível economizar contratando internet por CEP?"]) {
    assert.notEqual(veredito(doCep, proprio), "OUT_OF_SCOPE", `${proprio} é do artigo do CEP`);
  }
  /* FAQ não vira seção (AGENTS §13): sai do "fora do escopo" e fica como evidência, nunca promovido. */
  assert.equal(veredito(doCep, "Perguntas Frequentes Sobre Internet por CEP"), "OPTIONAL_EVIDENCE");
  /* O que não é deste artigo continua fora. */
  for (const fora of ["Qual é a internet mais rápida em Espírito Santo?", "Qual a velocidade ideal de internet?", "O Risco: Internet via Rádio (WISP)"]) {
    assert.equal(veredito(doCep, fora), "OUT_OF_SCOPE", fora);
  }

  const daComparacao = modelo(CLARO_VIVO_TIM, [
    ["Melhor internet em Salvador", 8], ["Planos de Internet com HBO Max", 7], ["Afinal, o que é internet com fibra ótica?", 5],
    ["Cobertura da Vivo", 2], ["Como contratar Claro Residencial?", 2], ["Internet Banda Larga com Fibra", 2], ["Minha Claro", 9],
    ["Adquira acessórios e gadgets na Claro!", 3], ["Qual é a operadora mais barata, Claro ou TIM?", 1], ["Qual número da Claro?", 1],
  ]);
  assert.notEqual(veredito(daComparacao, "Qual é a operadora mais barata, Claro ou TIM?"), "OUT_OF_SCOPE", "comparar Claro e TIM é o artigo");
});

/* ============================== 2 · o pedido e a conferência ============================== */

/* O modelo do "quantos mega" com as seções que a investigação real promoveu e os rótulos fora do escopo reais. */
function quantosMega(rotulosFora: string[]): RadarPortableExportInput {
  const base = modelo(QUANTOS_MEGA, [
    ["Como medir sua velocidade real", 6], ["Como saber quantos Mega tenho de internet?", 4],
    ["Como a velocidade em Mega é distribuída entre os dispositivos?", 1], ["Por que contratar 1 Giga com Wi-Fi 6?", 6],
    ["Qual a diferença entre Mega e Giga?", 3], ["800 Mega é bom?", 3], ["Quanto cada atividade consome", 3],
  ]);
  return entradaDe(QUANTOS_MEGA, { ...base, candidates: [...base.candidates, ...rotulosFora.map(rotulo => foraDoEscopo(rotulo, 2))] });
}

const FORA_DO_QUANTOS_MEGA = [
  "Qual é a velocidade de internet ideal?", "Internet via satélite x fibra: Starlink vale a pena?", "Como entender o teste de velocidade da internet?",
  "Como melhorar a velocidade de internet para residência?", "Como posso saber qual velocidade de internet é ideal para minha casa?",
  "Internet para trabalho remoto: como ter conexão estável", "Qual é a internet mais rápida do mundo?",
];

test("quantos mega (422 real): o rótulo genérico que a estrutura promovida trata sai do pedido; a seção promovida e a obrigatória não vão marcadas", () => {
  const pedido = pedidoDe(quantosMega(FORA_DO_QUANTOS_MEGA));
  assert.equal(pedido.outOfScope.includes("Qual é a velocidade de internet ideal?"), false, "a estrutura da investigação trata a velocidade");
  assert.ok(pedido.outOfScope.includes("Internet via satélite x fibra: Starlink vale a pena?"), "o que a estrutura não trata continua no pedido");
  assert.equal(idDoEsqueleto(pedido, /medir sua velocidade real/i).outOfScope, false, "a seção que a investigação promoveu");
  assert.equal(idDoEsqueleto(pedido, /^Virada para 300, 500, 600 Mega/).outOfScope, false, "o Assunto");
  assert.equal(pedido.skeleton.some(m => m.outOfScope), false, pedido.skeleton.filter(m => m.outOfScope).map(m => m.heading).join(" | "));
});

test("quantos mega (422 real): as seções da IA do caso real ficam — a planta sai com mais de três seções; o que é de fato de outro artigo continua saindo", () => {
  const pedido = pedidoDe(quantosMega(FORA_DO_QUANTOS_MEGA));
  const medir = idDoEsqueleto(pedido, /medir sua velocidade real/i).id;
  const virada = idDoEsqueleto(pedido, /^Virada para 300, 500, 600 Mega/).id;
  const distribuida = idDoEsqueleto(pedido, /quantos Mega tenho de internet/i).id;
  const oitocentos = idDoEsqueleto(pedido, /quanto cada atividade consome/i).id;
  const base = respostaDaPlanta(pedido, {}, { semLinks: true }) as { sections: Array<Record<string, unknown>> };
  const secao = (h2: string, readerQuestion: string, from: string[], h3: string[] = []) => ({ ...base.sections[0], h2, readerQuestion, from, h3, evidence: [] });
  const ia = RadarArticleBlueprintAiSchema.parse({
    ...base,
    sections: [
      /* Os H2 da resposta real (as notas do 422), com perguntas que falam de velocidade, como a IA escreveu. */
      secao("Como medir sua velocidade real no dia a dia?", "Como saber se a velocidade que chega é a contratada?", [medir]),
      secao("Quantos mega sua casa precisa, pela conta de uso", "Quantos Mega cada pessoa e cada aparelho pedem?", [distribuida], ["Quanto cada atividade consome de velocidade"]),
      secao("Virada para 300, 500, 600 Mega ou 1 Giga: quantos Mega você realmente precisa?", "Qual velocidade escolher entre 300, 500, 600 Mega e 1 Giga?", [virada]),
      secao("Como fechar a conta e contratar sem pagar pelo que não usa", "Como escolher o plano sem pagar a mais?", [oitocentos]),
      /* E uma seção que é mesmo de outro assunto da SERP: continua saindo. */
      secao("Starlink vale a pena para a sua casa?", "Internet via satélite vale a pena?", [medir]),
    ],
  });
  const { payload, notes } = radarSanitizeArticleBlueprint(ia, pedido);
  const h2 = payload.blueprint.sections.map(item => item.h2);
  assert.ok(h2.length >= 3, notes.join(" | "));
  assert.ok(h2.includes("Como medir sua velocidade real no dia a dia?"), notes.join(" | "));
  assert.ok(h2.includes("Virada para 300, 500, 600 Mega ou 1 Giga: quantos Mega você realmente precisa?"), notes.join(" | "));
  assert.ok(h2.includes("Quantos mega sua casa precisa, pela conta de uso"), notes.join(" | "));
  assert.ok(notes.some(nota => /Seção "Starlink vale a pena para a sua casa\?" removida: o pacote marca o assunto como fora do escopo/.test(nota)), notes.join(" | "));
  assert.equal(notes.some(nota => /origem em seção da SERP marcada fora do escopo/.test(nota)), false, notes.join(" | "));
  assert.equal(idasAoServidor.length, 0);
});

test("a identidade do artigo: com o rótulo genérico ainda no pedido, a 'Virada para <Assunto>' fica pela pergunta; a seção que não é identidade sai", () => {
  /* Sem a seção promovida de velocidade, o rótulo genérico continua no pedido (a guarda da conferência é a última linha). */
  const base = modelo(QUANTOS_MEGA, [["Por que contratar 1 Giga com Wi-Fi 6?", 6], ["Qual a diferença entre Mega e Giga?", 3], ["800 Mega é bom?", 3]]);
  const pedido = pedidoDe(entradaDe(QUANTOS_MEGA, { ...base, candidates: [...base.candidates, foraDoEscopo("Qual é a velocidade de internet ideal?", 2)] }));
  assert.ok(pedido.outOfScope.includes("Qual é a velocidade de internet ideal?"));
  const virada = idDoEsqueleto(pedido, /^Virada para 300, 500, 600 Mega/);
  assert.equal(virada.mustCover, true);
  assert.equal(virada.outOfScope, false);
  const resposta = respostaDaPlanta(pedido, {}, { semLinks: true }) as { sections: Array<Record<string, unknown>> };
  const ia = RadarArticleBlueprintAiSchema.parse({
    ...resposta,
    sections: [
      ...resposta.sections.slice(0, 3),
      { ...resposta.sections[0], h2: "Virada para 300, 500, 600 Mega ou 1 Giga: quantos Mega você realmente precisa?", readerQuestion: "Qual a velocidade ideal entre 300 Mega e 1 Giga?", from: [virada.id], h3: [] },
      { ...resposta.sections[0], h2: "Velocidade ideal: o número que serve para todo mundo", readerQuestion: "Qual a velocidade ideal?", from: [], h3: [] },
    ],
  });
  const { payload, notes } = radarSanitizeArticleBlueprint(ia, pedido);
  const h2 = payload.blueprint.sections.map(item => item.h2);
  assert.ok(h2.includes("Virada para 300, 500, 600 Mega ou 1 Giga: quantos Mega você realmente precisa?"), notes.join(" | "));
  assert.ok(notes.some(nota => /Virada para 300, 500, 600 Mega.*ficou: é a identidade do artigo/.test(nota)), notes.join(" | "));
  assert.equal(h2.includes("Velocidade ideal: o número que serve para todo mundo"), false, "o que não é identidade continua saindo pelo rótulo");
});

test("artigo 04 (CEP): a pergunta-molde da virada não leva o Assunto obrigatório ao descarte 'fora do escopo do pacote'", () => {
  /* O rótulo que a classificação de antes deixava fora (aqui posto à mão, como se ainda estivesse). */
  const base = modelo(NO_MEU_CEP, AMOSTRA_DO_CEP);
  /* A seção da virada como o modelo real a montou (sintética, obrigatória, com a pergunta-molde). */
  const secaoDaVirada = {
    ...base.sections[0], id: "subject-turn:cep", level: 2 as const, parentId: null, childSections: [],
    headingSuggestion: `Virada para ${NO_MEU_CEP.assunto}`,
    readerQuestion: `O que o leitor desta busca precisa entender para chegar a ${NO_MEU_CEP.assunto}?`,
    coveragePoints: [`virada para ${NO_MEU_CEP.assunto}`],
    mustCoverReasons: ["Assunto declarado no ArticleDNA"],
  };
  const pedido = pedidoDe(entradaDe(NO_MEU_CEP, {
    ...base,
    sections: [...base.sections, secaoDaVirada],
    candidates: [...base.candidates, foraDoEscopo("Como Funciona a Busca de Internet por CEP?")],
  }));
  const virada = idDoEsqueleto(pedido, /^Virada para Como saber quais operadoras/);
  assert.match(virada.readerQuestion || "", /desta busca/, "a pergunta-molde que casava com o rótulo");
  assert.equal(virada.mustCover, true);
  assert.equal(virada.outOfScope, false, "o Assunto não vai ao descarte");
});

/* ============================== 3 · a régua do "não cobrir" ============================== */

test("pronome de quantidade e advérbio de tempo não distinguem: 'quanto' e 'antes' não tiram seção", () => {
  const doPilar = radarOutOfScopeMatcher({ labels: ["Não sabe quanto tem de internet?"], core: [PILAR.principal, ...PILAR.secundarias, PILAR.assunto] });
  assert.equal(doPilar("Quanto custa de fato: promoção, reajuste e atendimento"), false);
  const doCep = radarOutOfScopeMatcher({ labels: ["O que analisar antes de contratar internet residencial"], core: [NO_MEU_CEP.principal, ...NO_MEU_CEP.secundarias, NO_MEU_CEP.assunto] });
  assert.equal(doCep("Como confirmar a disponibilidade antes de contratar"), false);
  /* O que distingue de verdade continua tirando. */
  const doQuantosMega = radarOutOfScopeMatcher({ labels: ["Internet via satélite x fibra: Starlink vale a pena?"], core: [QUANTOS_MEGA.principal, ...QUANTOS_MEGA.secundarias, QUANTOS_MEGA.assunto] });
  assert.equal(doQuantosMega("Starlink vale a pena para a sua casa?"), true);
});

/* ============================== 4 · o "Não cobrir" diz de qual artigo é ============================== */

const IRMAOS = [
  { label: "quantos mega de internet preciso", keywords: [QUANTOS_MEGA.principal, ...QUANTOS_MEGA.secundarias, QUANTOS_MEGA.assunto] },
  { label: "internet residencial barata", keywords: ["internet residencial barata", "preço internet residencial", "plano de internet residencial mais barato"] },
  { label: "internet no meu cep", keywords: [NO_MEU_CEP.principal, ...NO_MEU_CEP.secundarias, NO_MEU_CEP.assunto] },
];

test("o dono do rótulo fora do escopo é o irmão do Silo que traz o que o distingue; sem dono claro, ninguém é nomeado", () => {
  const nucleoDoPilar = [PILAR.principal, ...PILAR.secundarias, PILAR.assunto];
  assert.equal(radarOutOfScopeOwner("Velocidade de internet: o que muda entre 500, 600, 700 Mega ou mais?", { core: nucleoDoPilar, members: IRMAOS })?.label, "quantos mega de internet preciso");
  assert.equal(radarOutOfScopeOwner("Teste de velocidade de internet", { core: nucleoDoPilar, members: IRMAOS }), null, "o teste de velocidade é de outro Silo: nada se inventa");
  assert.equal(radarOutOfScopeOwner("Qual é a internet mais rápida do mundo?", { core: nucleoDoPilar, members: IRMAOS }), null);

  /* No CSV "Para escrever", a linha do "Não cobrir" nomeia o irmão. */
  const base = modelo(PILAR, [["Como escolher um plano de internet residencial", 8], ["Planos de internet residencial: o que comparar", 5], ["Custo total do plano", 3]]);
  const entrada = entradaDe(PILAR, { ...base, candidates: [...base.candidates, foraDoEscopo("Velocidade de internet: o que muda entre 500, 600, 700 Mega ou mais?"), foraDoEscopo("Teste de velocidade de internet")] });
  const silo = planoDoSilo().files[0].writing!;
  const membros = [
    { ...silo.members[0], articleId: "irmao-quantos-mega", principalKeyword: "quantos mega de internet preciso", title: QUANTOS_MEGA.promessa, slug: "quantos-mega-de-internet-preciso", inThisFile: false },
  ];
  const contexto: RadarWritingArticleContext = {
    topRowLabel: "Silo", filePosition: 1, articleId: ARTIGO, publication: null,
    silo: { ...silo, members: [...silo.members.filter(membro => membro.articleId === ARTIGO), ...membros] },
    siloPublications: new Map([["irmao-quantos-mega", { published: false, publishedUrl: null, canonical: null, slug: "quantos-mega-de-internet-preciso", principalPolicy: null, keywords: [QUANTOS_MEGA.principal, ...QUANTOS_MEGA.secundarias, QUANTOS_MEGA.assunto] }]]),
  };
  const linha = buildRadarWritingExportArticle(entrada, comPlanta(entrada, contexto));
  assert.match(linha.row.cobrir_e_superar, /"Velocidade de internet: o que muda entre 500, 600, 700 Mega ou mais\?": é do artigo "quantos mega de internet preciso" do Silo, que no máximo se menciona e linka\./, linha.row.cobrir_e_superar);
  assert.match(linha.row.cobrir_e_superar, /"Teste de velocidade de internet": O ArticleDNA não declara este assunto e ele não toca a composição de keywords: pertence a outro artigo\./, "sem dono no Silo, o motivo do pacote");
});
