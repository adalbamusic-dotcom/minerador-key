import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { montarRadar, React } from "./radar-dom-harness.mts";
import { RadarArticleModelExclusions, RadarArticleModelSection } from "../modules/radar/radar-article-model.tsx";
import {
  buildRadarEditorialArticleModel,
  type RadarEditorialArticleModel,
} from "../lib/radar/editorial-article-model.ts";
import type { RadarEditorialBlueprint, RadarSectionCandidate } from "../lib/radar/editorial-blueprint.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import { radarZeroDenominatorOffenders, type RadarCompetitiveObservedModel } from "../lib/radar/competitive-observed-model.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { buildRadarCompetitiveModel } from "../lib/radar/competitive-model.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { freezeRadarEvidenceBundle, radarFinalizationReadiness } from "../lib/radar/investigation-finalization.ts";
import type { RadarExtractionPage } from "../lib/radar/analysis-contracts.ts";

/*
 * ===== RADAR_EDITORIAL_BLUEPRINT_1 · O ARTIGO-MODELO, NÃO O RELATÓRIO =====
 *
 * O fixture é o artigo REAL de skincare que a tela mostrou: vinte candidatos,
 * vários sustentados por uma página de dez, com Pantenol, período menstrual e
 * acne hormonal promovidos a seção ao lado de "O que é pele oleosa?".
 *
 * A pergunta que cada teste faz é sempre a mesma: a SÍNTESE decidiu, ou só
 * repassou o que a SERP mencionou?
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

/* ============================ o ArticleDNA real =========================== */

const AMOSTRA = 10;

const contexto = (patch: Record<string, unknown> = {}): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "marca-1", articleId: "artigo-1",
    articleDnaVersionId: "dna-v1", articleDnaContentHash: "hash-dna-v1",
    promise: "Skincare para pele oleosa",
    mainIntent: "informacional",
    hierarchy: "Suporte",
    classification: { intent: "INFORMATIONAL", intentLabel: "Informacional", funnel: "TOP", funnelLabel: "Topo", reason: "Fechado pelo Arquiteto." },
  },
  keywords: [{ identity: { keywordId: "kw1", role: "principal", text: "skincare para pele oleosa" } }],
  editorialTopics: ["identificação da pele oleosa", "rotina de cuidados diária", "proteção solar"],
  resolvedKeywordTexts: ["skincare para pele oleosa", "como cuidar de pele oleosa", "hidratação para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
  ...patch,
} as unknown as RadarArticleResearchContext);

/* ======================== os vinte candidatos observados ==================== */

let sequencia = 0;

function candidato(input: {
  titulo: string;
  paginas: number;
  factual?: "ADEQUATE" | "PARTIAL" | "MISSING" | "CONFLICTED" | "NOT_REQUIRED";
  especialista?: boolean;
  links?: Array<{ destination: string; anchor: string; nodeId: string }>;
}): RadarSectionCandidate {
  sequencia += 1;
  const factual = input.factual || "NOT_REQUIRED";
  return {
    id: `candidate-${sequencia}`,
    conceptId: `concept-${sequencia}`,
    workingTitle: input.titulo,
    conceptTypeLabel: "Assunto",
    purpose: `Cobrir "${input.titulo}" como a amostra mostra.`,
    priority: input.paginas >= 5 ? "ESSENTIAL" : input.paginas >= 2 ? "RECOMMENDED" : "OPTIONAL",
    placement: "FLEXIBLE", placementReason: "",
    questions: [{
      id: `q-${sequencia}`, text: input.titulo, priority: "RECOMMENDED",
      answerRequirement: `O artigo precisa responder "${input.titulo}" de forma direta.`,
      marketStatement: `${input.paginas} de ${AMOSTRA} página(s) tratam desta necessidade.`,
      factualSupport: factual,
    }],
    definitions: [], entities: { primary: null, related: [] },
    marketEvidence: { pages: input.paginas, sampleSize: AMOSTRA, statement: `${input.paginas} de ${AMOSTRA}` },
    factualStatus: factual, factualNote: "",
    specialistRequirementIds: input.especialista ? [`req-${sequencia}`] : [],
    internalLinks: (input.links || []).map(link => ({
      nodeId: link.nodeId, destination: link.destination, direction: "OUTGOING",
      anchor: link.anchor, occurrences: 2, unresolved: false, reason: "",
    })),
    videoOpportunityId: null, differentiation: null, limitations: [],
    provenance: [], confidence: "MEDIUM",
  } as unknown as RadarSectionCandidate;
}

/*
 * OS VINTE — e a lista é a da tela real, com os outliers que §21 nomeia.
 *
 * As três primeiras são formulações da MESMA necessidade: se saírem como três
 * H2, o agrupamento não aconteceu.
 */
const candidatosDaTela = (): RadarSectionCandidate[] => {
  sequencia = 0;
  return [
    candidato({ titulo: "O que é a pele oleosa?", paginas: 7 }),
    candidato({ titulo: "Como é a pele oleosa?", paginas: 3 }),
    candidato({ titulo: "Pele oleosa: o que pode ser?", paginas: 2 }),

    candidato({ titulo: "Como cuidar de pele oleosa?", paginas: 6, links: [{ destination: "Skin care noturno", anchor: "skin care noturno", nodeId: "article:article-candidate:territory:9da03dd0-cf37-45c3-8562-20e943aa37bd:010c6b13" }] }),
    candidato({ titulo: "Como cuidar da pele oleosa e com tendência a acne?", paginas: 3 }),
    candidato({ titulo: "Como cuidar de uma pele acneica?", paginas: 2 }),

    candidato({ titulo: "Como controlar o brilho da pele oleosa?", paginas: 4 }),
    candidato({ titulo: "Pele oleosa precisa de hidratação?", paginas: 5, links: [{ destination: "Cuidados com máscara facial", anchor: "cuidados com máscara facial", nodeId: "article:article-candidate:territory:9da03dd0-86ae9b4e" }] }),
    candidato({ titulo: "Qual é a relação entre pele oleosa e acne?", paginas: 4, factual: "MISSING", especialista: true }),
    candidato({ titulo: "O que piora a oleosidade da pele?", paginas: 3 }),
    candidato({ titulo: "Como escolher produtos para pele oleosa?", paginas: 3 }),

    /* §28.D · declarado pelo ArticleDNA, pouco recorrente na amostra. */
    candidato({ titulo: "Proteção solar para pele oleosa", paginas: 1 }),

    /* §21 · os periféricos que a tela real promoveu a seção. */
    candidato({ titulo: "Para que serve o Pantenol?", paginas: 1 }),
    candidato({ titulo: "Acne hormonal e período menstrual", paginas: 1 }),
    candidato({ titulo: "Como tratar cabelo virgem?", paginas: 1 }),
    candidato({ titulo: "Quais são os tipos de acne?", paginas: 3 }),
    candidato({ titulo: "Dermatite seborreica no couro cabeludo", paginas: 1 }),

    /* §21 · popular na SERP, comercial, e o artigo é informacional de topo. */
    candidato({ titulo: "As melhores ofertas de produtos para pele oleosa", paginas: 5 }),
    candidato({ titulo: "Preços de séruns para pele oleosa", paginas: 3 }),
    candidato({ titulo: "Onde comprar produtos para pele oleosa", paginas: 2 }),
  ];
};

const observadoFalso = (): RadarCompetitiveObservedModel => ({
  sample: { comparablePages: AMOSTRA, uniqueReferences: 17, analyzedSuccess: AMOSTRA, failedFinal: 0 },
  concepts: {
    all: [
      /* A formulação MAIS FREQUENTE do concorrente — a que §10 proíbe copiar. */
      { id: "concept-1", canonicalLabel: "O que é a pele oleosa?", variants: ["O QUE É A PELE OLEOSA?", "O que caracteriza a pele oleosa?"] },
    ],
    recurrent: [], confirmed: [], undercovered: [], isolated: [],
  },
  structure: { measures: [], presences: [], patterns: [{ key: "USES_IMAGES", label: "Usa imagens", present: 10, sampleSize: 10, verdict: "dominant", evidence: "10 de 10 página(s) comparável(is)." }] },
  questions: [], entities: { primary: [], related: [] }, gaps: [], differentiations: [], conflicts: [], competitors: [],
  internalLinkPlan: { outgoing: [], siloPage: null },
  authorityEvidence: { specialistReviewRequirements: [] },
  aiDiscovery: { answerableUnits: [], definitionRequirements: [] },
  intent: { declared: "informacional", observedInSerp: "informacional" },
} as unknown as RadarCompetitiveObservedModel);

const blueprintFalso = (sections: RadarSectionCandidate[]): RadarEditorialBlueprint => ({
  article: { title: null, principal: "skincare para pele oleosa", objective: "Cobrir o tema.", intent: "Informacional", funnel: "Topo", siloRole: "SUPORTE" },
  opening: { directives: ["Responder diretamente a necessidade central."], evidence: "7 de 10 páginas." },
  sections,
  closing: { directives: ["Fechar com o próximo passo prático."], evidence: "10 de 10 páginas." },
  essentialQuestions: [], entities: { primary: [], related: [] },
  differentiation: { marketCovers: [], underCovered: [], ownOpportunities: [] },
  unresolvedLinks: [], specialistBriefs: [], videoBriefs: [], limitations: [],
  readiness: { state: "PARTIAL", reason: "" },
} as unknown as RadarEditorialBlueprint);

const modelo = (patch: { context?: RadarArticleResearchContext; sections?: RadarSectionCandidate[] } = {}): RadarEditorialArticleModel =>
  buildRadarEditorialArticleModel({
    context: patch.context || contexto(),
    observed: observadoFalso(),
    blueprint: blueprintFalso(patch.sections || candidatosDaTela()),
  });

const todasAsSecoes = (model: RadarEditorialArticleModel) => model.sections.flatMap(item => [item, ...item.childSections]);
const titulos = (model: RadarEditorialArticleModel) => todasAsSecoes(model).map(item => item.headingSuggestion);
const secaoDe = (model: RadarEditorialArticleModel, id: string | null | undefined) => todasAsSecoes(model).find(item => item.id === id) || null;
const vereditoDe = (model: RadarEditorialArticleModel, rotulo: string) =>
  model.candidates.find(item => item.observedLabel === rotulo);

/* ================================ §28 · A ================================ */

test("A · vinte candidatos NÃO significam vinte seções", () => {
  const model = modelo();

  assert.equal(candidatosDaTela().length, 20, "REAL_FIXTURE_BEFORE_SECTIONS = 20");
  assert.ok(model.sections.length < 20, `a síntese decidiu: ${model.sections.length} seções`);
  assert.ok(model.sections.length >= 3, "e não colapsou o artigo inteiro numa seção só");

  /* Nenhum candidato some: cada um tem veredito e motivo (§26). */
  assert.equal(model.candidates.length, 20, "todo candidato continua rastreável");
  for (const candidato of model.candidates) {
    assert.ok(candidato.reason.length > 10, `${candidato.observedLabel} sem motivo`);
  }
});

/* ================================ §28 · B ================================ */

test("B · formulações equivalentes da mesma necessidade viram UMA seção", () => {
  const model = modelo();

  const variantes = ["O que é a pele oleosa?", "Como é a pele oleosa?", "Pele oleosa: o que pode ser?"];
  const secoes = new Set(variantes.map(rotulo => vereditoDe(model, rotulo)?.sectionId));

  assert.equal(secoes.size, 1, "as três descrevem a mesma necessidade editorial");
  assert.ok([...secoes][0], "e ela foi promovida");

  /* Uma promovida, as outras absorvidas — nunca três H2 irmãos. */
  const vereditos = variantes.map(rotulo => vereditoDe(model, rotulo)?.verdict);
  assert.equal(vereditos.filter(item => item === "PROMOTED").length, 1);
  assert.equal(vereditos.filter(item => item === "MERGED").length, 2);

  /* E o mesmo vale para as variantes de "como cuidar". */
  const cuidados = ["Como cuidar de pele oleosa?", "Como cuidar da pele oleosa e com tendência a acne?", "Como cuidar de uma pele acneica?"]
    .map(rotulo => vereditoDe(model, rotulo)?.sectionId);
  assert.equal(new Set(cuidados).size, 1, "a arquitetura responde à intenção, não à fragmentação dos concorrentes");

  /*
   * O AGRUPAMENTO PRECISA SEPARAR TANTO QUANTO JUNTA.
   *
   * `pele` e `oleos` aparecem em quase todo candidato: um agrupamento que os
   * usasse como chave colapsaria o artigo num bloco só — e passaria neste
   * teste, porque "juntou" é exatamente o que ele pede acima.
   */
  assert.notEqual(vereditoDe(model, "O que é a pele oleosa?")?.sectionId, cuidados[0],
    "definir o assunto e explicar como cuidar dele são necessidades diferentes");
  assert.notEqual(vereditoDe(model, "Como controlar o brilho da pele oleosa?")?.sectionId, cuidados[0]);
  /*
   * E a necessidade que o assunto ARRASTA junto também precisa sobreviver.
   *
   * "Pele oleosa precisa de hidratação?" é o contraintuitivo do tema — é
   * justamente a pergunta que o leitor faz. Num agrupamento por assunto ela é
   * engolida pela definição e o artigo perde a seção que mais diferencia.
   */
  const definicao = vereditoDe(model, "O que é a pele oleosa?")?.sectionId;
  const hidratacao = vereditoDe(model, "Pele oleosa precisa de hidratação?");
  assert.equal(hidratacao?.verdict, "PROMOTED", "a hidratação é uma necessidade própria");
  assert.notEqual(hidratacao?.sectionId, definicao);
  assert.notEqual(hidratacao?.sectionId, cuidados[0]);

  assert.ok(todasAsSecoes(model).length >= 6, `${todasAsSecoes(model).length} necessidades: o artigo não colapsou`);
});

/* ============================== §28 · C e §21 ============================== */

test("C e §21 · outlier de 1 de 10 sem apoio do ArticleDNA NÃO vira seção", () => {
  const model = modelo();

  for (const outlier of ["Para que serve o Pantenol?", "Acne hormonal e período menstrual", "Como tratar cabelo virgem?", "Dermatite seborreica no couro cabeludo"]) {
    const veredito = vereditoDe(model, outlier);
    assert.ok(veredito, `${outlier} não foi avaliado`);
    assert.notEqual(veredito!.verdict, "PROMOTED", `${outlier} foi promovido`);
    assert.notEqual(veredito!.verdict, "MERGED", `${outlier} entrou por absorção`);
    assert.equal(veredito!.sectionId, null);
  }

  /*
   * §2 · E A EVIDÊNCIA SOZINHA NÃO ABRE A PORTA.
   *
   * "Quais são os tipos de acne?" tem TRÊS páginas — acima do piso — e mesmo
   * assim fica de fora: o ArticleDNA deste artigo não declara acne como
   * território. Sem esta asserção, um território que aceitasse tudo passaria
   * despercebido, porque os outliers acima também são recusados por evidência.
   */
  const acne = vereditoDe(model, "Quais são os tipos de acne?");
  assert.ok(acne);
  assert.equal(acne!.pages >= 2, true, "a evidência bastaria");
  assert.equal(acne!.dnaAligned, false, "e ainda assim o território não o contém");
  assert.equal(acne!.verdict, "OUT_OF_SCOPE");
  assert.match(acne!.reason, /ArticleDNA não declara/);

  /* OUTLIERS_PROMOTED = 0, dito também pelos cabeçalhos. */
  const cabecalhos = titulos(model).join(" | ").toLowerCase();
  for (const proibido of ["pantenol", "menstrual", "cabelo virgem", "seborreica"]) {
    assert.equal(cabecalhos.includes(proibido), false, `"${proibido}" apareceu como seção`);
  }
});

/* ================================ §28 · D ================================ */

test("D · assunto declarado pelo ArticleDNA entra mesmo com recorrência baixa", () => {
  const model = modelo();
  const veredito = vereditoDe(model, "Proteção solar para pele oleosa");

  assert.ok(veredito);
  assert.equal(veredito!.pages, 1, "uma página de dez");
  assert.equal(veredito!.dnaRequired, true, "e o ArticleDNA declara o tópico");
  assert.equal(veredito!.verdict, "PROMOTED");
  assert.match(veredito!.reason, /ArticleDNA/, "o motivo nomeia a porta pela qual ele entrou");

  const secao = secaoDe(model, veredito!.sectionId);
  assert.ok(secao, "o assunto tem endereço no artigo");
  assert.ok(
    secao!.coveragePoints.some(ponto => /prote(ç|c)(ã|a)o solar/i.test(ponto)) || /prote(ç|c)(ã|a)o solar/i.test(secao!.headingSuggestion),
    "e ele é coberto de verdade, como ponto ou como cabeçalho",
  );
  assert.ok(secao!.mustCoverReasons.some(motivo => /ArticleDNA/.test(motivo)), "com o motivo dito");

  /* A PROVA POR AUSÊNCIA: sem o tópico declarado, o mesmo candidato NÃO entra. */
  const semTopico = modelo({ context: contexto({ editorialTopics: ["identificação da pele oleosa"] }) });
  assert.notEqual(vereditoDe(semTopico, "Proteção solar para pele oleosa")?.verdict, "PROMOTED");
});

/* ================================ §28 · E ================================ */

test("E · popular na SERP mas fora da intenção declarada NÃO entra", () => {
  const model = modelo();

  const comercial = vereditoDe(model, "As melhores ofertas de produtos para pele oleosa");
  assert.ok(comercial);
  assert.equal(comercial!.pages, 5, "metade da amostra fala disso");
  assert.equal(comercial!.intentFit, false, "e mesmo assim não serve a um informacional de topo");
  assert.equal(comercial!.verdict, "OUT_OF_SCOPE");
  assert.match(comercial!.reason, /intenção declarada/i);

  for (const rotulo of ["Preços de séruns para pele oleosa", "Onde comprar produtos para pele oleosa"]) {
    assert.notEqual(vereditoDe(model, rotulo)?.verdict, "PROMOTED", `${rotulo} entrou`);
  }

  /*
   * E A REGRA É DA INTENÇÃO, NÃO DA PALAVRA.
   *
   * Num artigo de investigação comercial o mesmo candidato passa a servir — se
   * a checagem fosse uma lista de palavras proibidas, ele nunca entraria em
   * artigo nenhum.
   */
  const comercialDeclarado = modelo({
    context: contexto({
      article: { ...contexto().article, classification: { intent: "COMMERCIAL_INVESTIGATION", intentLabel: "Investigação comercial", funnel: "MIDDLE", funnelLabel: "Meio", reason: "" } },
    }),
  });
  assert.equal(vereditoDe(comercialDeclarado, "As melhores ofertas de produtos para pele oleosa")?.intentFit, true);
});

/* ================================ §28 · F ================================ */

test("F · o cabeçalho do concorrente NÃO é copiado como recomendação", () => {
  const model = modelo();

  const observadas = new Set(["o que e a pele oleosa", "o que caracteriza a pele oleosa"]);
  const normalizar = (valor: string) =>
    valor.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  for (const secao of todasAsSecoes(model)) {
    assert.equal(observadas.has(normalizar(secao.headingSuggestion)), false,
      `"${secao.headingSuggestion}" é a formulação do concorrente`);
    /* E a DIRETIVA existe ao lado: é ela que sobrevive a outra escolha de frase. */
    assert.ok(secao.headingDirection.length > 10, `${secao.headingSuggestion} sem direção`);
    assert.notEqual(secao.headingDirection, secao.headingSuggestion);
  }
});

/* ============================== §28 · G, I e J ============================== */

test("G, I e J · cada seção é utilizável, e a dependência é dita", () => {
  const model = modelo();

  for (const secao of todasAsSecoes(model)) {
    assert.ok(secao.objective.length > 5, `${secao.headingSuggestion} sem objetivo`);
    assert.ok(secao.readerQuestion.length > 5, `${secao.headingSuggestion} sem pergunta`);
    assert.ok(secao.coveragePoints.length > 0, `${secao.headingSuggestion} sem o que cobrir`);
  }

  /* §15 · a seção que depende de fonte não passa como qualquer outra. */
  const acne = todasAsSecoes(model).find(item => item.evidenceRefs.some(ref => ref === vereditoDe(model, "Qual é a relação entre pele oleosa e acne?")?.id));
  assert.ok(acne, "a seção da relação com acne existe");
  assert.equal(acne!.factualSupport, "MISSING");
  assert.match(acne!.factualRequirement || "", /Precisa de fonte/);
  assert.match(acne!.specialistRequirement || "", /revisão profissional/);

  assert.ok(model.evidenceNeeds.length >= 1, "e a dependência sobe para o topo do modelo");
  assert.ok(model.specialistNeeds.length >= 1);
});

/* ================================ §28 · L ================================ */

test("L · a identidade do ArticleDNA é preservada, e ela é o núcleo", () => {
  const model = modelo();

  assert.equal(model.articleIdentity.articleId, "artigo-1");
  assert.equal(model.articleIdentity.articleDnaVersionId, "dna-v1");
  assert.equal(model.articleIdentity.principalKeyword, "skincare para pele oleosa");
  assert.equal(model.articleIdentity.intentLabel, "Informacional");
  assert.equal(model.articleIdentity.funnelLabel, "Topo");
  assert.equal(model.articleIdentity.siloRole, "SUPORTE");
});

/* ================================ §22 ================================ */

test("§22 · 'Parcial' diz o que falta, não só que falta algo", () => {
  const model = modelo();

  assert.equal(model.readiness.state, "PARTIAL");
  assert.ok(model.readiness.reasons.length > 0, "e o rótulo se explica");
  assert.match(model.readiness.label, /^Parcial · /);
  assert.match(model.readiness.label, /fonte|revisão/);

  /* Sem dependência nenhuma, o rótulo muda de verdade. */
  const limpo = modelo({
    sections: [
      candidato({ titulo: "O que é a pele oleosa?", paginas: 9, factual: "ADEQUATE" }),
      candidato({ titulo: "Como cuidar de pele oleosa?", paginas: 8, factual: "ADEQUATE" }),
    ],
  });
  assert.equal(limpo.readiness.state, "READY");
  assert.deepEqual(limpo.readiness.reasons, []);
});

/* ======================= §13 e §28 · H · a UI ======================= */

async function montarModelo(model: RadarEditorialArticleModel) {
  const tela = await montarRadar();
  await tela.render(React.createElement(RadarArticleModelSection, { model }));
  return tela;
}

test("H e §13 · nenhum identificador técnico aparece na visão editorial", async () => {
  const model = modelo({
    sections: [
      candidato({
        titulo: "Como cuidar de pele oleosa?", paginas: 6,
        links: [{ destination: "Skin care noturno", anchor: "skin care noturno", nodeId: "article:article-candidate:territory:9da03dd0-cf37-45c3-8562-20e943aa37bd:010c6b13-6ffc-4f4b-9b0f" }],
      }),
      candidato({ titulo: "O que é a pele oleosa?", paginas: 7 }),
    ],
  });
  const tela = await montarModelo(model);
  const texto = tela.text();

  /* TECHNICAL_IDS_IN_NORMAL_VIEW = 0 */
  for (const proibido of ["article:article-candidate", "territory:", "9da03dd0", "concept-", "candidate-", "section:"]) {
    assert.equal(texto.includes(proibido), false, `"${proibido}" vazou para a leitura editorial`);
  }
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(texto), false, "nenhum UUID na visão normal");

  /* §14 · o link aparece por NOME e aplicação. */
  const link = tela.get("radar-article-model-link").textContent || "";
  assert.match(link, /Skin care noturno/);
  assert.match(link, /skin care noturno/);
  assert.match(link, /Onde aplicar/);
  assert.match(link, /Função/);
  tela.destroy();
});

test("K · as contagens de evidência ficam atrás do disclosure", async () => {
  const tela = await montarModelo(modelo());

  /*
   * §12 · "7 de 10 páginas" repetido em cada bloco foi o que transformou a
   * leitura em relatório. O número não sumiu — ele mudou de camada.
   */
  const primeira = tela.all("radar-article-model-section")[0];
  const disclosure = primeira.querySelector('[data-testid="radar-article-model-evidence"]') as HTMLElement;
  assert.ok(disclosure, "a seção tem o disclosure de evidências");
  assert.equal((disclosure as HTMLDetailsElement).open, false, "e ele nasce fechado");
  assert.match(disclosure.textContent || "", /de 10 página/, "a contagem está lá dentro");

  /*
   * E fora dele, o corpo da seção não repete a telemetria — incluindo as
   * subseções, que têm o próprio disclosure e a própria contagem.
   */
  const copia = primeira.cloneNode(true) as HTMLElement;
  for (const dentro of [...copia.querySelectorAll('[data-testid="radar-article-model-evidence"]')]) dentro.remove();
  assert.equal(/\d+ de \d+ página/.test(copia.textContent || ""), false, "a leitura editorial não recita a amostra");
  tela.destroy();
});

test("§7, §26 e 1.1·§16 · o que NÃO entrou saiu do Blueprint e continua inteiro", async () => {
  const model = modelo();

  /* 1.1 · §16 · REJECTED_CANDIDATES_IN_NORMAL_VIEW = NO. */
  const principal = await montarModelo(model);
  assert.equal(principal.query("radar-article-model-rejected"), null,
    "decisão de exclusão não disputa espaço com a arquitetura do artigo");
  assert.equal(/Pantenol|melhores ofertas/.test(principal.text()), false);
  principal.destroy();

  /* E continua inteiro, com motivo, onde a pergunta dele é feita (§26). */
  const tela = await montarRadar();
  await tela.render(React.createElement(RadarArticleModelExclusions, { model }));

  const recusados = tela.get("radar-article-model-rejected");
  assert.equal((recusados as HTMLDetailsElement).open, false, "recolhido: é auditoria, não produto");
  const texto = recusados.textContent || "";

  assert.match(texto, /Pantenol/, "quem conhece o assunto confere que o Radar VIU e decidiu");
  assert.match(texto, /melhores ofertas/);
  assert.ok(tela.all("radar-article-model-rejected-item").length >= 5);
  tela.destroy();
});

/* ====================== §16, §17 e §19 · a ordem da tela ====================== */

test("§16, §17 e §19 · o artigo-modelo vem antes da evidência, que fica recolhida", async () => {
  const fonte = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  const inicio = fonte.indexOf("{areaGoogle && <>");
  const fim = fonte.indexOf("{plannerHandoff && !areaGoogle && <PlannerHandoff", inicio);
  assert.ok(inicio > 0 && fim > inicio, "a área do Google foi localizada");
  const area = fonte.slice(inicio, fim);

  const artigo = area.indexOf("<RadarArticleModelSection");
  const evidencia = area.indexOf('data-testid="radar-competitive-evidence"');
  const blueprintCompetitivo = area.indexOf("<RadarCompetitiveBlueprintSection");
  const amostra = area.indexOf('data-testid="radar-google-sample"');
  const proveniencia = area.indexOf('data-testid="radar-technical-provenance"');

  assert.ok(artigo > 0, "o artigo-modelo está na área");
  assert.ok(artigo < evidencia, "§19 · o artigo-modelo vem ANTES da evidência competitiva");
  assert.ok(evidencia < blueprintCompetitivo, "§17 · o blueprint competitivo mora DENTRO do disclosure");
  assert.ok(evidencia < amostra && amostra < proveniencia, "a ordem é evidência → amostra → proveniência");

  /* COMPETITIVE_EVIDENCE_COLLAPSED e PROVENANCE_COLLAPSED: nada nasce aberto. */
  const emUmaLinha = area.replace(/\s+/g, " ");
  assert.equal(/<details\s+open/.test(emUmaLinha), false);
  assert.equal(/open=\{/.test(emUmaLinha), false);

  /* §19 · a decisão fica junto do que se decide, e a fronteira é UMA. */
  const handoff = area.indexOf("<PlannerHandoff");
  assert.ok(artigo < handoff && handoff < evidencia, "enviar ao Planejador vem logo depois do artigo-modelo");
  assert.match(fonte, /\{plannerHandoff && !areaGoogle && <PlannerHandoff/, "e ela não renderiza duas vezes");
});

/* ============================== §28 · M e N ============================== */

test("M e N · a evidência anterior continua inteira e rastreável", async () => {
  const model = modelo();

  /* Cada seção aponta para os candidatos que a sustentam. */
  for (const secao of todasAsSecoes(model)) {
    assert.ok(secao.evidenceRefs.length > 0, `${secao.headingSuggestion} sem evidência apontada`);
    for (const ref of secao.evidenceRefs) {
      assert.ok(model.candidates.some(item => item.id === ref), `${ref} não está entre os candidatos`);
    }
  }

  /* O blueprint de candidatos NÃO foi substituído: ele continua na projeção. */
  const projecao = await readFile(new URL("../lib/radar/deep-research-view.ts", import.meta.url), "utf8");
  assert.match(projecao, /blueprint: blueprintEditorial,/, "o dossiê de candidatos continua na view");
  assert.match(projecao, /articleModel: buildRadarEditorialArticleModel\(/, "e a síntese é derivada dele");

  /* E o handoff ao Planejador continua levando o dossiê de candidatos. */
  const handoff = await readFile(new URL("../lib/radar/planner-handoff.ts", import.meta.url), "utf8");
  assert.match(handoff, /editorialBlueprint/, "RADAR_EVIDENCE_BUNDLE_COMPATIBLE");

  /* A tela de candidatos não foi apagada — foi recolhida. */
  const workbench = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  assert.match(workbench, /data-testid="radar-candidate-evidence"/);
  assert.match(workbench, /<RadarBlueprintSummaryCard blueprint=/);
});

test("sentinela · nenhuma ida ao servidor neste gate", () => {
  assert.deepEqual(idasAoServidor, []);
});

test("§20 · a arquitetura resultante, impressa para aceitação visual", () => {
  const model = modelo();
  const linhas = [
    `REAL_FIXTURE_BEFORE_SECTIONS = 20`,
    `REAL_FIXTURE_AFTER_SECTIONS  = ${model.sections.length}`,
    "",
    "ABERTURA",
    ...model.sections.flatMap(secao => [
      `H2 — ${secao.headingSuggestion}   [${secao.evidenceStrength}]${secao.factualRequirement ? " ⚠ fonte" : ""}${secao.specialistRequirement ? " ⚠ especialista" : ""}`,
      ...secao.childSections.map(filho => `   H3 — ${filho.headingSuggestion}`),
    ]),
    "CONCLUSÃO",
    "",
    `NÃO ENTRARAM (${model.candidates.filter(item => !item.sectionId).length}):`,
    ...model.candidates.filter(item => !item.sectionId).map(item => `  · ${item.observedLabel} — ${item.verdict}`),
  ];
  linhas.push("", `TÍTULO SUGERIDO: ${model.titleSuggestion}`);
  linhas.push(`OUTRAS DIREÇÕES: ${model.titleAlternatives.join(" · ")}`);
  linhas.push(`DIREÇÃO: ${model.editorialAngle}`);
  linhas.push(`PROMESSA: ${model.readerPromise}`);
  linhas.push(`PLANO VISUAL: ${model.mediaSummary || "—"}`);
  linhas.push(`CTA: ${model.conclusion.callToAction}`);
  linhas.push("", "COBRIR (eixo prático):");
  for (const ponto of (model.sections.find(item => item.editorialFunction === "APPLICATION")?.coveragePoints || [])) linhas.push(`  - ${ponto}`);
  console.log(linhas.join("\n"));
  assert.ok(model.sections.length > 0);
});

/* =============== 1.1 · §23 · EXECUTIVO E HIERARQUIA =============== */

const CONTAGEM = /\d+\s+de\s+\d+\s+p(á|a)gina/i;

test("1.1·A e §7 · o objetivo é editorial, nunca a contagem da amostra", () => {
  const model = modelo();

  for (const secao of todasAsSecoes(model)) {
    assert.equal(CONTAGEM.test(secao.objective), false, `"${secao.objective}" é telemetria, não objetivo`);
    assert.equal(/formula(ç|c)(ã|a)o|consulta/i.test(secao.objective), false);
    assert.ok(secao.objective.length > 20, "e ele diz para que a seção serve");
  }

  /*
   * A PROVA DE QUE O DEFEITO ERA REAL: o candidato TRAZ a contagem em
   * `purpose`, e era ela que aparecia como objetivo.
   */
  assert.equal(
    todasAsSecoes(model).some(secao => candidatosDaTela().some(item => item.purpose === secao.objective)),
    false,
    "nenhuma seção repassa o propósito observado como objetivo editorial",
  );
});

test("1.1·B · a transição genérica sai da visão normal e continua no contrato", async () => {
  const model = modelo();

  assert.ok(model.opening.transition.length > 0, "o Planejador continua alcançando a instrução");

  const tela = await montarModelo(model);

  /*
   * §3 · O TOPO EXECUTIVO NÃO DESCREVE O PROCESSO.
   *
   * "7 necessidades sintetizadas de 20 candidatos" é a conta da SÍNTESE: ela
   * responde "como o Radar chegou aqui", que é pergunta de auditoria. Quem vai
   * escrever precisa da direção do artigo.
   */
  const executivo = tela.get("radar-article-model-executive").textContent || "";
  assert.equal(/candidato\(s\)|sintetizada|necessidade\(s\)/i.test(executivo), false,
    `o topo executivo recita o processo: "${executivo}"`);
  assert.equal(CONTAGEM.test(executivo), false);
  assert.match(executivo, /Promessa ao leitor/);

  const abertura = tela.get("radar-article-model-opening").textContent || "";
  assert.equal(abertura.includes(model.opening.transition), false, "ela não ocupa linha na leitura editorial");
  assert.equal(/Transi(ç|c)(ã|a)o/i.test(tela.text()), false);
  assert.match(abertura, /Hook/);
  assert.match(abertura, /Promessa/);
  tela.destroy();
});

test("1.1·C · mensagem-chave é conteúdo ou é ausente — nunca boilerplate", async () => {
  const model = modelo();

  for (const secao of todasAsSecoes(model)) {
    if (secao.keyMessage === null) continue;
    assert.equal(/O artigo precisa responder/i.test(secao.keyMessage), false,
      `"${secao.keyMessage}" é instrução de writer, não mensagem`);
  }

  /* Sem diferenciação observada, o campo não é preenchido com enchimento. */
  assert.ok(todasAsSecoes(model).every(secao => secao.keyMessage === null),
    "esta amostra não sustenta nenhuma mensagem: o campo fica vazio");

  /* Com diferenciação observada, ela aparece — o campo não é decorativo. */
  const comMensagem = modelo({
    sections: [
      { ...candidato({ titulo: "O que é a pele oleosa?", paginas: 7 }), differentiation: "A amostra converge: oleosidade não se resolve ressecando a pele." } as unknown as RadarSectionCandidate,
      candidato({ titulo: "Como cuidar de pele oleosa?", paginas: 6 }),
    ],
  });
  assert.match(comMensagem.sections[0].keyMessage || "", /não se resolve ressecando/);

  const tela = await montarModelo(comMensagem);
  assert.match(tela.get("radar-article-model-message").textContent || "", /não se resolve ressecando/);
  tela.destroy();
});

test("1.1·D e §9 · exigido pelo ArticleDNA significa MUST_COVER, não MUST_H2", () => {
  const model = modelo();
  const solar = vereditoDe(model, "Proteção solar para pele oleosa");

  assert.equal(solar?.dnaRequired, true);
  assert.equal(solar?.verdict, "PROMOTED", "coberto: DNA_REQUIRED_MEANS_MUST_COVER = SIM");

  /*
   * 1.2 · §6 · O PLACEMENT É DECISÃO, E ELE TEM MAIS DE UMA SAÍDA.
   *
   * Proteção solar não pertence ao tema de nenhuma seção — não é subtema de
   * nada. Com uma página de dez, um H3 só para ela daria a um item de rotina o
   * peso de um bloco. Ela entra como PONTO A COBRIR do eixo prático.
   */
  const secao = secaoDe(model, solar!.sectionId);
  assert.ok(secao, "o assunto tem endereço no artigo");
  assert.ok(
    secao!.coveragePoints.some(ponto => /prote(ç|c)(ã|a)o solar/i.test(ponto)),
    "coberto como ponto da seção que o hospeda",
  );
  assert.ok(secao!.mustCoverReasons.some(motivo => /ArticleDNA/.test(motivo)), "com o motivo dito");

  /* E em NENHUM lugar ele virou cabeçalho por decreto. */
  const cabecalhos = todasAsSecoes(model).map(item => item.headingSuggestion).join(" | ");
  assert.equal(/prote(ç|c)(ã|a)o solar/i.test(cabecalhos), false, "DNA_REQUIRED_FORCES_HEADING = NO");
});

test("1.1·E e F · a hierarquia tem pai e filho coerentes", () => {
  const model = modelo();

  const h2 = model.sections;
  const h3 = h2.flatMap(item => item.childSections);

  assert.ok(h2.length >= 3 && h2.length <= 6, `${h2.length} H2: arquitetura coesa, não uma lista`);
  assert.ok(h3.length >= 2, `${h3.length} H3: a hierarquia aconteceu`);

  for (const pai of h2) {
    assert.equal(pai.level, 2);
    assert.equal(pai.parentId, null);
    for (const filho of pai.childSections) {
      assert.equal(filho.level, 3);
      assert.equal(filho.parentId, pai.id, "o filho aponta para o pai");
      assert.equal(filho.childSections.length, 0, "dois níveis, nunca três");
    }
  }

  /*
   * §10 · O EIXO PRÁTICO ABSORVE AS APLICAÇÕES.
   *
   * Controlar o brilho e escolher produtos são etapas de montar a rotina —
   * lado a lado como H2, o artigo vira uma lista de perguntas.
   */
  const rotina = secaoDe(model, vereditoDe(model, "Como cuidar de pele oleosa?")?.sectionId);
  assert.equal(rotina?.level, 2);
  const filhosDaRotina = rotina!.childSections.map(item => item.headingSuggestion).join(" | ");
  assert.match(filhosDaRotina, /brilho/i);
  assert.match(filhosDaRotina, /produtos/i);

  /*
   * E FUNDAMENTO NÃO DESCE PARA DEBAIXO DE APLICAÇÃO.
   *
   * A explicação da relação com acne compartilha a palavra "acne" com a rotina;
   * sem a trava de função ela virava etapa do passo a passo, e o artigo passava
   * a explicar a causa no meio da recomendação.
   */
  const relacao = secaoDe(model, vereditoDe(model, "Qual é a relação entre pele oleosa e acne?")?.sectionId);
  assert.equal(relacao?.level, 2, "explicar vem antes de recomendar");
  assert.equal(relacao?.editorialFunction, "EXPLANATION");
});

test("1.1·G e H · recorrência não garante H2; cobertura exigida não exige H2", () => {
  const model = modelo();

  /* §12 · tipos de acne tem 3 de 10 e continua fora: não é eixo deste artigo. */
  assert.equal(vereditoDe(model, "Quais são os tipos de acne?")?.sectionId, null);

  /*
   * §13 · ACNE HORMONAL — com o ArticleDNA declarando, a cobertura acontece.
   * O que NÃO acontece é ela virar eixo: entra sob o H2 a que pertence.
   */
  const comDna = modelo({
    context: contexto({
      editorialTopics: ["identificação da pele oleosa", "rotina de cuidados diária", "proteção solar", "acne hormonal"],
    }),
  });
  const hormonal = vereditoDe(comDna, "Acne hormonal e período menstrual");
  assert.equal(hormonal?.dnaRequired, true, "o DNA declara");
  assert.equal(hormonal?.verdict, "PROMOTED", "e por isso é coberto");

  const secao = secaoDe(comDna, hormonal!.sectionId);
  assert.equal(secao?.level, 3, "mas não vira H2 por decreto");
  assert.ok(secao?.parentId);
});

test("1.1·J e §17 · o card técnico da investigação congelada saiu do fluxo principal", async () => {
  const fonte = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  const inicio = fonte.indexOf("{areaGoogle && <>");
  const fim = fonte.indexOf("{plannerHandoff && !areaGoogle && <PlannerHandoff", inicio);
  const area = fonte.slice(inicio, fim);

  const congelado = area.indexOf('data-testid="radar-frozen-bundle"');
  const proveniencia = area.indexOf('data-testid="radar-technical-provenance"');
  const artigo = area.indexOf("<RadarArticleModelSection");

  assert.ok(congelado > 0, "o card continua existindo — esconder não é apagar");
  assert.ok(proveniencia > 0 && congelado > proveniencia, "FROZEN_TECH_CARD_IN_NORMAL_VIEW = NO");
  assert.ok(artigo < proveniencia, "e o artigo-modelo continua na frente de tudo");

  /* §16 · e as decisões de exclusão moram na evidência competitiva. */
  const evidencia = area.indexOf('data-testid="radar-competitive-evidence"');
  const exclusoes = area.indexOf("<RadarArticleModelExclusions");
  assert.ok(exclusoes > evidencia, "REJECTED_CANDIDATES_IN_NORMAL_VIEW = NO");
  assert.ok(exclusoes < proveniencia);
});

test("1.1·K e L · sem UUID na visão normal, e a evidência continua acessível", async () => {
  const model = modelo();
  const tela = await montarModelo(model);
  const texto = tela.text();

  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(texto), false, "NORMAL_VIEW_UUIDS = 0");
  for (const proibido of ["article:article-candidate", "territory:", "section:", "candidate-", "concept-"]) {
    assert.equal(texto.includes(proibido), false, `"${proibido}" vazou`);
  }

  /*
   * §20 · E A LEITURA CABE: cabeçalho, função, o que cobrir e selos.
   *
   * O teto é grosseiro de propósito — ele não mede beleza, mede se a seção
   * voltou a carregar parágrafos de justificativa.
   */
  for (const cartao of tela.all("radar-article-model-section")) {
    const copia = cartao.cloneNode(true) as HTMLElement;
    for (const dentro of [...copia.querySelectorAll('[data-testid="radar-article-model-evidence"]')]) dentro.remove();
    for (const dentro of [...copia.querySelectorAll('[data-testid="radar-article-model-subsection"]')]) dentro.remove();
    assert.ok((copia.textContent || "").length < 700, "o cartão da seção voltou a inchar");
  }

  /* EVIDENCE_PRESERVED: a contagem continua a um clique. */
  const evidencia = tela.all("radar-article-model-evidence")[0];
  assert.match(evidencia.textContent || "", CONTAGEM);
  tela.destroy();
});

/* ============ 1.2 · §15 · A FOTOCÓPIA EDITORIAL ============ */

test("1.2·A · o título é conteúdo utilizável, não a instrução de como titular", async () => {
  const model = modelo();

  /* A instrução continua no contrato — e some da leitura. */
  assert.match(model.titleDirection, /Nomear/, "o Planejador continua alcançando a diretriz");
  assert.equal(/Nomear|sem repetir keyword|precisa aparecer/i.test(model.titleSuggestion), false,
    `"${model.titleSuggestion}" ainda é instrução`);

  /* É uma frase que dá para colar no CMS: sem interrogação de busca, com assunto. */
  assert.ok(model.titleSuggestion.length > 20);
  assert.ok(model.titleSuggestion.split(" ").length >= 5);

  /* §1 · e nenhuma das direções copia formulação observada. */
  const observadas = new Set(candidatosDaTela().map(item => item.workingTitle.toLowerCase()));
  for (const opcao of [model.titleSuggestion, ...model.titleAlternatives]) {
    assert.equal(observadas.has(opcao.toLowerCase()), false, `"${opcao}" é a formulação do concorrente`);
  }
  assert.ok(model.titleAlternatives.length >= 1, "há pelo menos uma outra direção");

  /*
   * O CASO EM QUE A TRAVA DECIDE.
   *
   * Quando a formulação gerada COINCIDE com a do concorrente, a escada precisa
   * descer para a próxima. Sem um fixture assim, a trava poderia não existir e
   * o teste continuaria verde.
   */
  const colidindo = modelo({
    sections: [
      candidato({ titulo: "O que é a pele oleosa?", paginas: 7 }),
      candidato({ titulo: "Como cuidar de pele oleosa?", paginas: 6 }),
      /* Um concorrente que já escreve exatamente a frase que a escada geraria. */
      candidato({ titulo: "Como cuidar de pele oleosa", paginas: 2 }),
      candidato({ titulo: "Como controlar o brilho da pele oleosa?", paginas: 4 }),
    ],
  });
  const observadaNaColisao = "como cuidar de pele oleosa";
  for (const opcao of [colidindo.titleSuggestion, ...colidindo.titleAlternatives]) {
    assert.notEqual(opcao.toLowerCase().replace(/\?+$/, ""), observadaNaColisao,
      `"${opcao}" é exatamente a formulação do concorrente`);
  }

  const tela = await montarModelo(model);
  const executivo = tela.get("radar-article-model-executive").textContent || "";
  assert.match(executivo, /Título sugerido/);
  assert.ok(executivo.includes(model.titleSuggestion));
  assert.match(tela.get("radar-article-model-title-alternatives").textContent || "", /Outras direções/);
  tela.destroy();
});

test("1.2·B · a promessa e a direção são DESTE artigo", () => {
  const model = modelo();

  /* A promessa fala do que o leitor leva, com o eixo do artigo dentro. */
  assert.equal(/cobrir com clareza|leitura prática e completa/i.test(model.readerPromise), false,
    `"${model.readerPromise}" é promessa genérica`);
  /*
   * 1.4 · §3 · A PROMESSA É O RESULTADO, não o título em prosa.
   *
   * Ela deixou de repetir o eixo e passou a dizer o que estará resolvido ao
   * final — e o que ela lista vem das FUNÇÕES presentes na arquitetura.
   */
  assert.match(model.readerPromise, /^Ao final, o leitor /);
  assert.ok(model.sections.some(item => item.editorialFunction === "APPLICATION"));
  assert.match(model.readerPromise, /rotina definida/i, "o eixo prático aparece como resultado");

  /* §12 · e a chamada final também — não um fecho que serve a qualquer artigo. */
  assert.match(model.conclusion.callToAction, /cuidar de pele oleosa/i);
  assert.equal(/ação que o artigo habilita|sem promessa nova/i.test(model.conclusion.callToAction), false);

  /*
   * 1.4 · §3 · A DIREÇÃO É ESTRATÉGIA — e ela não repete o título em prosa.
   *
   * Ela descreve como o argumento se organiza: o que abre, o que entra como
   * contexto, o que o ArticleDNA obriga a cobrir, onde a dependência é dita.
   */
  assert.equal(/Fundamento primeiro, aplicação depois/i.test(model.editorialAngle), false);
  assert.match(model.editorialAngle, /Abrir pelo fundamento|Ir direto à aplicação/);
  assert.match(model.editorialAngle, /causas entram como contexto|ArticleDNA exige|declara a dependência/);

  /*
   * A PROVA DE ESPECIFICIDADE: com outra arquitetura, a frase muda.
   *
   * Sem isto, uma constante bem escrita passaria — e "específico" viraria
   * "escrito à mão uma vez".
   */
  const outro = modelo({
    sections: [
      candidato({ titulo: "O que é a pele oleosa?", paginas: 7 }),
      candidato({ titulo: "Como escolher produtos para pele oleosa?", paginas: 6 }),
    ],
  });
  assert.notEqual(outro.readerPromise, model.readerPromise);
  assert.notEqual(outro.titleSuggestion, model.titleSuggestion);
});

test("1.2·C · os pontos a cobrir são editoriais, sem matéria-prima", async () => {
  const model = modelo();

  for (const secao of todasAsSecoes(model)) {
    for (const ponto of secao.coveragePoints) {
      assert.equal(ponto.includes("?"), false, `"${ponto}" ainda é pergunta de busca`);
      assert.equal(/^Definir antes de aprofundar/i.test(ponto), false, `"${ponto}" é matéria-prima`);
      assert.equal(ponto === ponto.toUpperCase() && ponto.length > 4, false, `"${ponto}" é rótulo de conceito cru`);
      assert.equal(/^[A-Z]/.test(ponto), false, `"${ponto}" não foi editorializado`);
    }
  }

  /*
   * E A LISTA NÃO REPETE A MESMA NECESSIDADE.
   *
   * As três formulações de "como cuidar" foram agrupadas justamente por serem a
   * mesma coisa; listá-las todas devolveria a fragmentação ao Redator.
   */
  const eixo = model.sections.find(item => item.editorialFunction === "APPLICATION");
  assert.ok(eixo);
  const comoCuidar = eixo!.coveragePoints.filter(ponto => /^como cuidar/i.test(ponto));
  assert.ok(comoCuidar.length <= 2, `${comoCuidar.length} formulações de "como cuidar": a fragmentação voltou`);
  assert.ok(eixo!.coveragePoints.length <= 4, `${eixo!.coveragePoints.length} pontos: a lista voltou a inchar`);

  /* A formulação original continua inteira na evidência. */
  const tela = await montarModelo(model);
  const evidencias = tela.all("radar-article-model-evidence").map(item => item.textContent || "").join(" ");
  assert.match(evidencias, /Como cuidar da pele oleosa e com tendência a acne/);
  tela.destroy();
});

test("1.2·D · o H3 tem função compatível com o pai", () => {
  const model = modelo();

  const RANK: Record<string, number> = { DEFINITION: 0, EXPLANATION: 1, APPLICATION: 2, SELECTION: 3, COVERAGE: 4 };

  for (const pai of model.sections) {
    for (const filho of pai.childSections) {
      assert.ok(RANK[pai.editorialFunction] <= RANK[filho.editorialFunction],
        `"${filho.headingSuggestion}" (${filho.editorialFunction}) não pertence a "${pai.headingSuggestion}" (${pai.editorialFunction})`);
    }
  }

  /*
   * §5 · O EXEMPLO PROIBIDO, EXPLÍCITO.
   *
   * "Como surge a acne hormonal" sob "Como cuidar" é o caso que o gate nomeia:
   * uma explicação pendurada numa aplicação. Com o DNA exigindo acne hormonal,
   * ela precisa ir para o bloco que EXPLICA a acne.
   */
  const comDna = modelo({
    context: contexto({
      editorialTopics: ["identificação da pele oleosa", "rotina de cuidados diária", "proteção solar", "acne hormonal"],
    }),
  });
  const hormonal = secaoDe(comDna, vereditoDe(comDna, "Acne hormonal e período menstrual")?.sectionId);
  assert.ok(hormonal, "o assunto exigido tem endereço");
  const pai = comDna.sections.find(item => item.id === (hormonal!.parentId || hormonal!.id));
  assert.ok(pai);
  assert.notEqual(pai!.editorialFunction, "APPLICATION",
    "explicação de causa não vira etapa do passo a passo");
});

test("1.2·G · o link mostra um título útil, nunca o identificador", async () => {
  /* O plano de links devolve `slug || nodeId`: sem slug, o destino vinha como id. */
  const semSlug = modelo({
    sections: [
      candidato({ titulo: "O que é a pele oleosa?", paginas: 7 }),
      candidato({
        titulo: "Como cuidar de pele oleosa?", paginas: 6,
        links: [{ destination: "article:article-candidate:territory:9da03dd0-cf37-45c3-8562-20e943aa37bd", anchor: "skin care noturno", nodeId: "article:article-candidate:territory:9da03dd0" }],
      }),
    ],
  });

  const link = semSlug.internalLinkApplications[0];
  assert.ok(link, "o link chegou ao modelo");
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}/i.test(link.destination), false, "sem UUID no destino");
  assert.equal(link.destination.includes("article:"), false);
  assert.equal(link.destination, "skin care noturno", "sem nome, mostra a âncora — que é o texto da página");

  const tela = await montarModelo(semSlug);
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}/i.test(tela.text()), false, "TECHNICAL_IDS_OUTSIDE_PROVENANCE = 0");
  tela.destroy();
});

test("1.2·H · não sobrou painel solto na área FINALIZED", async () => {
  const fonte = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  const inicio = fonte.indexOf("{areaGoogle && <>");
  const fim = fonte.indexOf("{plannerHandoff && !areaGoogle && <PlannerHandoff", inicio);
  const area = fonte.slice(inicio, fim);

  /*
   * §10 · OS DOIS PAINÉIS ENTRARAM NA EVIDÊNCIA COMPETITIVA.
   *
   * Eles eram irmãos da área, competindo com o artigo-modelo e respondendo a
   * mesma pergunta que o disclosure já faz.
   */
  const evidencia = area.indexOf('data-testid="radar-competitive-evidence"');
  const extras = area.indexOf("{evidenceExtras}");
  const amostra = area.indexOf('data-testid="radar-google-sample"');
  assert.ok(extras > evidencia && extras < amostra, "LEGACY_LOOSE_PANELS = 0");

  /*
   * E eles não renderizam mais como IRMÃOS da área de Pesquisa.
   *
   * A declaração do nó continua no componente — é dela que os dois saem. O que
   * não pode existir é o render solto, ao lado do artigo-modelo.
   */
  const painel = fonte.indexOf('{expandedArea === "pesquisa" && <div key={model.articleId}');
  const fimPainel = fonte.indexOf('{expandedArea === "videos"', painel);
  const dentroDoPainel = fonte.slice(painel, fimPainel);
  assert.ok(painel > 0 && fimPainel > painel, "o painel de Pesquisa foi localizado");
  assert.equal(dentroDoPainel.includes('data-testid="radar-candidate-evidence"'), false,
    "candidatos observados não é mais irmão do artigo-modelo");
  assert.equal(dentroDoPainel.includes('data-testid="radar-research-details-disclosure"'), false,
    "detalhes da pesquisa não é mais irmão do artigo-modelo");

  /*
   * §10 · E O QUE NÃO É GOOGLE NÃO PERDEU NADA.
   *
   * Quando o 1.2 fechou, fora da área Google não existia "Ver evidência
   * competitiva" para absorvê-los, e eles ficaram como irmãos soltos. O
   * PROFILES_2 deu o disclosure aos dois perfis e o 2.1 · §25 os moveu para
   * dentro dele — mesma consulta, uma porta só.
   *
   * O que este teste garante continua sendo o mesmo: eles não foram apagados, e
   * fora da área Google eles chegam POR PROP em vez de render solto.
   */
  assert.equal(/\{!areaGoogle && evidenceExtras\}/.test(fonte), false, "o render solto acabou — §25");
  assert.equal((fonte.match(/evidenceExtras=\{evidenceExtras\}/g) || []).length, 2,
    "YouTube e Amazon mantêm a consulta, agora dentro da evidência");
  assert.match(fonte, /data-testid="radar-research-details-disclosure"/);
  assert.match(fonte, /data-testid="radar-candidate-evidence"/);

  /*
   * A CONTENÇÃO REAL é provada no DOM, em `radar-editorial-profiles-21`: aqui a
   * verificação é de ordem, e ela basta para pegar um render solto reintroduzido
   * acima da porta.
   */
  for (const painel of ["radar-youtube-search-panel", "radar-amazon-search-panel"]) {
    const fontePainel = await readFile(new URL(`../modules/radar/${painel}.tsx`, import.meta.url), "utf8");
    const porta = fontePainel.indexOf("competitive-evidence");
    const usos = [...fontePainel.matchAll(/\{evidenceExtras\}/g)].map(item => item.index || 0);
    assert.ok(porta > 0, `${painel}: a porta de evidência existe`);
    assert.equal(usos.length, 1, `${painel}: o nó legado é renderizado UMA vez`);
    assert.ok(usos[0] > porta, `${painel}: LEGACY_LOOSE_PANELS = 0`);
  }
});

test("1.2·I e J · exclusões e evidência continuam acessíveis e rastreáveis", () => {
  const model = modelo();

  /* I · cada candidato recusado continua com motivo. */
  const recusados = model.candidates.filter(item => !item.sectionId);
  assert.ok(recusados.length >= 5);
  for (const item of recusados) assert.ok(item.reason.length > 20);

  /* J · e cada seção aponta para os candidatos que a sustentam. */
  for (const secao of todasAsSecoes(model)) {
    assert.ok(secao.evidenceRefs.length > 0);
    for (const ref of secao.evidenceRefs) {
      assert.ok(model.candidates.some(item => item.id === ref), `${ref} perdeu o candidato`);
    }
  }

  /* O que virou ponto dentro de outra seção continua endereçado. */
  const solar = vereditoDe(model, "Proteção solar para pele oleosa");
  assert.ok(solar?.sectionId, "o assunto rebaixado não ficou órfão");
  assert.ok(secaoDe(model, solar!.sectionId), "e o endereço existe na árvore");
});

test("1.2·§13 · o redator entende o artigo sem abrir um disclosure", async () => {
  const model = modelo();
  const tela = await montarModelo(model);

  /* Tudo o que §13 exige está na superfície, sem clique. */
  const visivel = (() => {
    const copia = tela.container.cloneNode(true) as HTMLElement;
    for (const details of [...copia.querySelectorAll("details")]) {
      const resumo = details.querySelector("summary");
      details.replaceChildren(...(resumo ? [resumo] : []));
    }
    return copia.textContent || "";
  })();

  assert.ok(visivel.includes(model.titleSuggestion), "título");
  assert.ok(visivel.includes(model.readerPromise), "promessa");
  assert.match(visivel, /Hook/, "abertura");
  for (const secao of model.sections) {
    assert.ok(visivel.includes(secao.headingSuggestion), `H2 ${secao.headingSuggestion}`);
    for (const filho of secao.childSections) assert.ok(visivel.includes(filho.headingSuggestion), `H3 ${filho.headingSuggestion}`);
    for (const ponto of secao.coveragePoints) assert.ok(visivel.includes(ponto), `cobrir: ${ponto}`);
  }
  assert.match(visivel, /Precisa de fonte|Especialista|Evidência suficiente/, "dependências");
  assert.match(visivel, /Plano visual/, "mídia resumida");
  assert.match(visivel, /Links internos/, "links resumidos");

  /* E NENHUMA estatística de SERP é necessária para isso. */
  assert.equal(/\d+ de \d+ página/.test(visivel), false, "a leitura não depende de estatística");
  tela.destroy();
});

/* ============ 1.3 · a investigação REAL, montada como no runtime ============ */

/*
 * O artigo do print: skincare para pele oleosa, 11 páginas analisadas, 10
 * comparáveis, 17 referências, investigação congelada.
 *
 * A fixture precisa ser a de RUNTIME — vista inteira, não modelo intermediário —
 * porque o defeito que este gate conserta mora justamente na passagem do
 * payload compacto para a projeção.
 */
const paginaReal = (indice: number, headings: string[]): RadarExtractionPage => ({
  id: `competitor:page-${indice}`,
  url: `https://dominio-${indice}.com.br/skincare-pele-oleosa`,
  status: "success", fetchedAt: "2026-09-10T10:00:00.000Z",
  title: `Concorrente ${indice}`, metaDescription: "", canonical: null,
  h1: ["Skincare para pele oleosa"], h2: headings, h3: [], wordCount: 1700,
  internalLinkCount: 4, externalLinkCount: 2, listCount: 2, tableCount: 0, faqCount: 1,
  imageCount: 3, blockquoteCount: 0, comparisonCount: 0, hasDates: true,
  author: "Redação", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 4, italicCount: 0, paragraphCount: 14, paragraphWordCounts: [80],
  headingOutline: [{ level: 1, text: "Skincare para pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 70, introText: "A pele oleosa produz mais sebo do que precisa.", closingWordCount: 50,
  closingText: "Fecho.", hasClosing: true, emphasizedTerms: [], keywordPlacement: null,
  observedLinks: [], error: null,
} as unknown as RadarExtractionPage);

const H2_REAIS = [
  "O QUE É A PELE OLEOSA?",
  "Como cuidar de pele oleosa?",
  "Como controlar o brilho da pele oleosa?",
  "Pele oleosa precisa de hidratação?",
  "Qual é a relação entre pele oleosa e acne?",
  "Como surge a acne hormonal?",
  "Quais são os tipos de acne?",
  "Como escolher produtos para pele oleosa?",
];

/*
 * ONZE ANALISADAS, DEZ COMPARÁVEIS — exatamente o que o print mostra.
 *
 * A décima primeira é uma página de categoria: ela foi lida com sucesso e NÃO
 * entra nas medidas estruturais. Sem essa assimetria a fixture não reproduz o
 * caso real, e a diferença entre "analisadas" e "comparáveis" — que é metade do
 * defeito — não seria exercitada.
 */
const PAGINAS_REAIS = [
  ...Array.from({ length: 10 }, (_, indice) =>
    paginaReal(indice + 1, H2_REAIS.slice(0, Math.max(3, H2_REAIS.length - (indice % 4))))),
  { ...paginaReal(11, []), h1: [], h2: [], wordCount: 120, paragraphCount: 2, headingOutline: [] } as unknown as RadarExtractionPage,
];

const SNAPSHOT_REAL = {
  query: "skincare para pele oleosa",
  organicResults: PAGINAS_REAIS.map((item, indice) => ({
    position: indice + 1, title: item.title, domain: `d${indice}.com.br`, url: item.url,
  })),
};

const contextoReal = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "marca-1", articleId: "artigo-1",
    articleDnaVersionId: "dna-v1", articleDnaContentHash: "hash-dna-v1",
    promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte",
    classification: { intent: "INFORMATIONAL", intentLabel: "Informacional", funnel: "TOP", funnelLabel: "Topo", reason: "Fechado pelo Arquiteto." },
  },
  keywords: [{
    identity: { keywordId: "kw1", canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: "kdna-1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, resultCount: 4200, kgrScore: 0.589, incrementalVolume: null, contribution: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", contentHash: "h", intent: "informacional", funnel: "TOFU", semanticState: "conclusive", collectedAt: "2026-09-01T10:00:00.000Z" } },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: "kdna-1", keywordDnaContentHash: "hash-kdna" },
  }],
  editorialTopics: ["identificação da pele oleosa", "rotina de cuidados diária", "proteção solar"],
  resolvedKeywordTexts: ["skincare para pele oleosa", "como cuidar de pele oleosa", "hidratação para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null,
  internalLinks: {
    graphId: "graph-1", graphVersionId: "graph-v1", graphContentHash: `sha256:${"c".repeat(64)}`,
    edges: [
      { sourceNodeId: "article:este", targetNodeId: "article:pilar", relationType: "SUPPORT_TO_PILLAR", anchorConcepts: ["skin care noturno"], reason: "O suporte devolve ao Pilar", priority: "HIGH", direction: "outbound" },
    ],
  },
  limitations: [],
} as unknown as RadarArticleResearchContext);

const registroBase = () => startRadarDeepResearch({
  context: contextoReal(), plan: buildRadarResearchQueryPlan(contextoReal()),
  startedBy: "ator", now: "2026-09-10T09:00:00.000Z",
});

/**
 * O REGISTRO COM CURADORIA — sem ela a investigação não tem amostra.
 *
 * As referências entram pelo universo e só viram amostra depois de uma decisão
 * humana. Montar o registro sem esse passo produz uma investigação que o
 * congelamento recusa, e o teste mediria o vazio.
 */
const registroDaPesquisa = () => {
  const universo = buildRadarDeepResearchView({
    context: contextoReal(), record: registroBase(), snapshot: SNAPSHOT_REAL as never,
    extractions: PAGINAS_REAIS, observedAt: "2026-09-11T12:00:00.000Z",
  } as Parameters<typeof buildRadarDeepResearchView>[0]);

  return {
    ...registroBase(),
    researchCuration: {
      universeFingerprint: radarResearchUniverseFingerprint(universo.references),
      confirmedAt: "2026-09-10T09:30:00.000Z", confirmedBy: "ator",
      references: universo.references.map(reference => ({
        referenceId: reference.referenceId, normalizedUrl: reference.normalizedUrl, url: reference.url,
        decision: autoDecideRadarReference(reference).decision, reason: "",
      })),
    },
  };
};

/*
 * A FOTOGRAFIA REAL: 10 comparáveis, 11 analisadas, 17 referências.
 *
 * Congelada pelo helper de produção e depois ajustada para os números do print
 * — é a assimetria com a leitura viva que expõe a regressão.
 */
/** O modelo estrutural como ele fica GRAVADO no relatório competitivo. */
const modeloPersistido = () => buildRadarCompetitiveModel({
  pages: PAGINAS_REAIS,
  query: "skincare para pele oleosa",
  observedIntent: null,
  principal: "skincare para pele oleosa",
  editorialTopics: contextoReal().editorialTopics,
  keywordTexts: contextoReal().resolvedKeywordTexts,
  centralEntities: [],
  provenance: [],
} as Parameters<typeof buildRadarCompetitiveModel>[0]);

const fotografiaReal = () => {
  const viva = buildRadarDeepResearchView({
    context: contextoReal(), record: registroDaPesquisa(), snapshot: SNAPSHOT_REAL as never,
    extractions: PAGINAS_REAIS, observedAt: "2026-09-11T12:00:00.000Z", selectedReferences: 10, curationConfirmed: true,
  } as Parameters<typeof buildRadarDeepResearchView>[0]);

  const congelado = freezeRadarEvidenceBundle({
    readiness: radarFinalizationReadiness({
      started: true, stale: false, alreadyFinalized: false,
      pending: 0, analyzed: viva.observed.sample.analyzedSuccess,
      failed: viva.observed.sample.failedFinal, sufficiency: viva.sufficiency,
    }),
    observed: viva.observed, record: registroDaPesquisa(), mode: "WEB", sufficiency: viva.sufficiency,
    frozenBy: "ator", frozenAt: "2026-09-11T08:00:00.000Z",
  });
  if (!congelado.ok) throw new Error(`a fixture não congelou: ${congelado.reason}`);

  return {
    ...congelado.bundle,
    sample: { ...congelado.bundle.sample, comparablePages: 10, analyzedSuccess: 11, failedFinal: 0 },
    search: { ...congelado.bundle.search, uniqueReferences: 17, selectedReferences: 10 },
  };
};

/* ========== 1.3 · §17 · A FOTOGRAFIA COMO AUTORIDADE DE RUNTIME ========== */

/*
 * A vista REAL, montada pelo mesmo caminho do runtime — e nos DOIS transportes.
 *
 * É a única forma de provar §15: o que muda entre FULL e COMPACT é a matéria
 * -prima pesada, e nada mais. Testar só o modelo intermediário deixaria passar
 * exatamente o defeito que este gate veio consertar.
 */
const vistaFinalizada = (transporte: "FULL" | "COMPACT") => buildRadarDeepResearchView({
  context: contextoReal(),
  record: { ...registroDaPesquisa(), finalizedAt: "2026-09-11T08:00:00.000Z", finalizedBy: "ator", conclusion: "PARTIAL" },
  snapshot: SNAPSHOT_REAL as never,
  /* O transporte compacto entrega o payload SEM as extrações. É o caso real. */
  extractions: transporte === "FULL" ? PAGINAS_REAIS : [],
  /*
   * O MODELO ESTRUTURAL PERSISTIDO — é assim que o runtime funciona.
   *
   *  NÃO é compactado: a semântica
   * das páginas fica gravada na versão. Sem passá-lo, o teste mediria uma
   * compactação que o produto não faz, e a paridade seria impossível por
   * construção — não por defeito.
   */
  model: modeloPersistido(),
  extractionFailures: 0,
  selectedReferences: 10,
  curationConfirmed: true,
  observedAt: "2026-09-11T12:00:00.000Z",
  finalizedBundle: fotografiaReal() as never,
} as Parameters<typeof buildRadarDeepResearchView>[0]);

test("1.3·A e §1 · a fotografia responde pelas contagens, mesmo sem as páginas", () => {
  const compacta = vistaFinalizada("COMPACT");

  /* ROOT_CAUSE: a amostra era contada das extrações que o transporte removeu. */
  assert.equal(compacta.observed.sample.comparablePages, 10, "COMPARABLE_PAGES_RUNTIME = 10");
  assert.equal(compacta.observed.sample.analyzedSuccess, 11);
  assert.equal(compacta.observed.sample.failedFinal, 0);

  /* E a prova por ausência: sem fotografia, o compacto realmente zera. */
  const semFotografia = buildRadarDeepResearchView({
    context: contextoReal(), record: registroDaPesquisa(), snapshot: SNAPSHOT_REAL as never,
    extractions: [], observedAt: "2026-09-11T12:00:00.000Z",
  } as Parameters<typeof buildRadarDeepResearchView>[0]);
  assert.equal(semFotografia.observed.sample.comparablePages, 0,
    "sem fotografia não há o que preservar — é a leitura viva, e ela está vazia mesmo");
});

test("1.3·B e §3 · nenhum '7 de 0' sai da projeção", () => {
  for (const transporte of ["FULL", "COMPACT"] as const) {
    const vista = vistaFinalizada(transporte);
    const ofensas = radarZeroDenominatorOffenders(vista);
    assert.deepEqual(ofensas, [], `${transporte}: ZERO_DENOMINATOR_OUTPUT deveria ser NO, veio ${ofensas.join(" · ")}`);
  }

  /*
   * A VARREDURA PRECISA SABER ACHAR — senão ela prova o silêncio dela mesma.
   */
  assert.deepEqual(
    radarZeroDenominatorOffenders({ texto: "7 de 0 página(s) comparável(is)" }),
    ["7 de 0"],
  );
  assert.deepEqual(radarZeroDenominatorOffenders({ texto: "0 de 0 páginas" }), [],
    "zero sobre zero é ausência de amostra, não contradição");
});

test("1.3·C e §5 · a suficiência é a da fotografia, não a do transporte", () => {
  const compacta = vistaFinalizada("COMPACT");
  const cheia = vistaFinalizada("FULL");

  assert.equal(compacta.sufficiency.level, cheia.sufficiency.level, "SUFFICIENCY_RUNTIME estável");
  assert.notEqual(compacta.sufficiency.level, "INSUFFICIENT",
    "dez páginas aceitas não viram 'Análise insuficiente' por transporte");
  assert.equal(compacta.sufficiency.headline, cheia.sufficiency.headline);
});

test("1.3·D e §6 · o Blueprint competitivo não mistura 0 vivo com 10 congelado", () => {
  const compacta = vistaFinalizada("COMPACT");

  /* O modelo competitivo lê `observed`: se ele diz 10, o painel diz 10. */
  assert.equal(compacta.observed.sample.comparablePages, 10);
  for (const conceito of compacta.observed.concepts.all) {
    assert.equal(conceito.sampleSize, 10, `"${conceito.canonicalLabel}" com denominador ${conceito.sampleSize}`);
  }
  for (const unidade of compacta.observed.aiDiscovery.answerableUnits) {
    assert.equal(unidade.marketRecurrence.sampleSize, 10);
    assert.ok(unidade.marketRecurrence.pages <= 10, "numerador nunca maior que a fotografia");
  }
});

test("1.3·L e §15 · FULL e COMPACT produzem a MESMA decisão editorial", () => {
  const cheia = vistaFinalizada("FULL");
  const compacta = vistaFinalizada("COMPACT");

  const decisao = (vista: ReturnType<typeof vistaFinalizada>) => ({
    comparablePages: vista.observed.sample.comparablePages,
    sufficiency: vista.sufficiency.level,
    titulo: vista.articleModel.titleSuggestion,
    direcao: vista.articleModel.editorialAngle,
    promessa: vista.articleModel.readerPromise,
    prontidao: vista.articleModel.readiness.label,
    /* §13 · os padrões estruturais também não podem mudar de transporte. */
    padroes: vista.observed.structure.patterns.map(item => `${item.key}:${item.present}/${item.sampleSize}:${item.verdict}`),
    arquitetura: vista.articleModel.sections.map(secao => ({
      heading: secao.headingSuggestion,
      funcao: secao.editorialFunction,
      cobrir: secao.coveragePoints,
      filhos: secao.childSections.map(filho => filho.headingSuggestion),
    })),
  });

  assert.deepEqual(decisao(compacta), decisao(cheia), "FULL_COMPACT_EDITORIAL_PARITY");

  /* A ÚNICA diferença permitida: a matéria-prima pesada não veio. */
  assert.ok(cheia.observed.competitors.length >= 0);
  assert.equal(compacta.articleModel.sections.length > 0, true, "e o artigo continua montado");
});

/* ============ 1.3 · §7 a §9 · a qualidade lexical do título ============ */

test("1.3·E e F · o título usa conceitos completos, nunca token isolado", () => {
  const model = vistaFinalizada("COMPACT").articleModel;
  const textos = [model.titleSuggestion, ...model.titleAlternatives, model.editorialAngle, model.readerPromise];

  /*
   * O DEFEITO REAL: "brilho, tipos e surge". Três radicais, nenhum conceito.
   * "surge" é pedaço de verbo; "tipos" sem contexto não é assunto de nada.
   */
  for (const texto of textos) {
    for (const fragmento of [/(^|[\s:,])surge([\s,.]|$)/i, /(^|[\s:,])tipos([\s,.]|$)/i, /(^|[\s:,])piora([\s,.]|$)/i]) {
      assert.equal(fragmento.test(texto), false, `"${texto}" carrega fragmento isolado`);
    }
  }

  /*
   * E O QUE ENTRA NA LISTA É CONCEITO, não a última palavra do cabeçalho.
   *
   * "brilho" tem sete letras e passaria por qualquer teste de tamanho — o que o
   * distingue de "controlar o brilho" é ser um pedaço, não uma necessidade.
   */
  const facetas = (model.titleSuggestion.split(":")[1] || "").split(/,| e /).map(item => item.trim()).filter(Boolean);
  assert.ok(facetas.length >= 2, "o título lista o que o artigo entrega");
  assert.ok(facetas.some(face => face.includes(" ")), `nenhuma faceta é conceito completo: ${facetas.join(" · ")}`);
  assert.match(model.titleSuggestion, /controlar o brilho/i, "a faceta carrega o verbo e o objeto");
  for (const face of facetas) {
    assert.ok(face.length > 5, `"${face}" é fragmento, não conceito`);
  }
});

test("1.3·G · direção e promessa também usam conceitos completos", () => {
  const model = vistaFinalizada("COMPACT").articleModel;

  assert.match(model.editorialAngle, /Abrir pelo fundamento|Ir direto à aplicação|Organizar a leitura/);
  assert.ok(model.editorialAngle.length > 60, "a direção descreve a estratégia, não lista radicais");
  assert.match(model.readerPromise, /^Ao final, o leitor /);

  /* Nada de telemetria vazando para o topo executivo. */
  for (const texto of [model.editorialAngle, model.readerPromise, model.titleSuggestion]) {
    assert.equal(/\d+ de \d+|p(á|a)gina\(s\)|consulta/i.test(texto), false, `"${texto}" carrega telemetria`);
  }
});

/* ============ 1.3 · §10 a §14 · hierarquia e superfície ============ */

test("1.3·H e §10 · 'como surge' é causa e não desce para o eixo prático", () => {
  const model = vistaFinalizada("COMPACT").articleModel;

  const hormonal = model.sections
    .flatMap(secao => [{ secao, pai: null as string | null }, ...secao.childSections.map(filho => ({ secao: filho, pai: secao.editorialFunction }))])
    .find(item => /acne hormonal/i.test(item.secao.headingSuggestion));

  if (hormonal) {
    assert.notEqual(hormonal.pai, "APPLICATION", "CAUSE_UNDER_APPLICATION = NO");
    assert.notEqual(hormonal.secao.editorialFunction, "APPLICATION",
      '"Como surge a acne hormonal" descreve causa, não passo a passo');
  }

  /*
   * A CLASSIFICAÇÃO, PROVADA COM O ASSUNTO DENTRO DO TERRITÓRIO.
   *
   * No fixture de runtime a acne não é declarada pelo ArticleDNA, e por isso a
   * pergunta fica de fora — o que é correto e não exercita a regra. Com o DNA
   * declarando, ela entra: e aí "Como surge a acne hormonal?" precisa ser causa,
   * não etapa do passo a passo.
   */
  const comDna = modelo({
    context: contexto({
      editorialTopics: ["identificação da pele oleosa", "rotina de cuidados diária", "acne hormonal"],
    }),
    sections: [
      candidato({ titulo: "O que é a pele oleosa?", paginas: 7 }),
      candidato({ titulo: "Como cuidar de pele oleosa?", paginas: 6 }),
      candidato({ titulo: "Qual é a relação entre pele oleosa e acne?", paginas: 4 }),
      candidato({ titulo: "Como surge a acne hormonal?", paginas: 1 }),
    ],
  });

  const surge = todasAsSecoes(comDna).find(secao => /acne hormonal/i.test(secao.headingSuggestion))
    || todasAsSecoes(comDna).find(secao => secao.coveragePoints.some(ponto => /acne hormonal/i.test(ponto)));
  assert.ok(surge, "o assunto declarado pelo ArticleDNA é coberto");

  const classificada = todasAsSecoes(comDna).find(secao => /acne hormonal/i.test(secao.headingSuggestion));
  if (classificada) {
    assert.notEqual(classificada.editorialFunction, "APPLICATION",
      '"Como surge a acne hormonal" descreve causa, não passo a passo');
    const pai = comDna.sections.find(item => item.id === classificada.parentId);
    if (pai) assert.notEqual(pai.editorialFunction, "APPLICATION", "CAUSE_UNDER_APPLICATION = NO");
  } else {
    /* Virou ponto a cobrir: então o anfitrião não pode ser o eixo prático. */
    assert.notEqual(surge!.editorialFunction, "APPLICATION", "CAUSE_UNDER_APPLICATION = NO");
  }
});

test("1.3·I, J e K · a visão normal não carrega telemetria, texto longo do DNA nem caixa crua", async () => {
  const model = vistaFinalizada("COMPACT").articleModel;
  const tela = await montarModelo(model);

  const visivel = (() => {
    const copia = tela.container.cloneNode(true) as HTMLElement;
    for (const details of [...copia.querySelectorAll("details")]) {
      const resumo = details.querySelector("summary");
      details.replaceChildren(...(resumo ? [resumo] : []));
    }
    return copia.textContent || "";
  })();

  /* I · RECURRENCE_TEXT_IN_NORMAL_VIEW = NO */
  assert.equal(/\d+ de \d+ p(á|a)gina/i.test(visivel), false);
  assert.equal(/A busca evidencia|Sustentado por|Relacionado ao assunto declarado/i.test(visivel), false);
  assert.equal(/formula(ç|c)(õ|o)es|consulta(s)? distinta/i.test(visivel), false);

  /*
   * J · ARTICLE_DNA_LONG_TEXT_IN_NORMAL_VIEW = NO — o selo fica, a frase desce.
   *
   * A prova usa o modelo que TEM exigência declarada: no fixture de runtime o
   * ArticleDNA não declara nenhum assunto com recorrência baixa, e a asserção
   * mediria a ausência de algo que nunca existiu.
   */
  assert.equal(/a arquitetura decide onde/i.test(visivel), false);

  const comExigencia = modelo();
  assert.ok(
    todasAsSecoes(comExigencia).some(secao => secao.mustCoverReasons.length > 0),
    "o fixture tem assunto exigido pelo ArticleDNA",
  );
  const outra = await montarModelo(comExigencia);
  const visivelComExigencia = (() => {
    const copia = outra.container.cloneNode(true) as HTMLElement;
    for (const details of [...copia.querySelectorAll("details")]) {
      const resumo = details.querySelector("summary");
      details.replaceChildren(...(resumo ? [resumo] : []));
    }
    return copia.textContent || "";
  })();
  assert.equal(/a arquitetura decide onde/i.test(visivelComExigencia), false, "a frase inteira não fica na leitura");
  assert.match(visivelComExigencia, /Exigido pelo ArticleDNA/, "e o selo continua dizendo que existe exigência");
  const evidencias = outra.all("radar-article-model-evidence").map(item => item.textContent || "").join(" ");
  assert.match(evidencias, /a arquitetura decide onde/i, "com o motivo inteiro a um clique");
  outra.destroy();

  /* K · RAW_CASING_IN_NORMAL_VIEW = NO */
  const gritos = visivel.match(/\b[A-ZÀ-Þ]{4,}(\s+[A-ZÀ-Þ]{2,})+/g) || [];
  assert.deepEqual(gritos, [], `caixa crua na leitura editorial: ${gritos.join(" · ")}`);
  tela.destroy();
});

/* ============ 1.4 · O BRIEFING EDITORIAL, COMO ELE É LIDO ============ */

/** O modelo com o território de acne declarado — é onde o bloco temático nasce. */
const modeloComAcne = () => modelo({
  context: contexto({
    editorialTopics: ["identificação da pele oleosa", "rotina de cuidados diária", "acne hormonal"],
  }),
  sections: [
    candidato({ titulo: "O que é a pele oleosa?", paginas: 7 }),
    candidato({ titulo: "Como cuidar de pele oleosa?", paginas: 6, links: [{ destination: "Skin care noturno", anchor: "skin care noturno", nodeId: "article:node-1" }] }),
    candidato({ titulo: "Qual é a relação entre pele oleosa e acne?", paginas: 4, factual: "MISSING", especialista: true }),
    candidato({ titulo: "O que causa acne?", paginas: 3 }),
    candidato({ titulo: "Quais são os tipos de acne?", paginas: 3 }),
    candidato({ titulo: "Como surge a acne hormonal?", paginas: 1 }),
  ],
});

test("1.4·A e B · o título é curto, editorial e não concatena queries", () => {
  const model = modelo();

  /* Duas facetas é o teto: título não é sumário. */
  const facetas = (model.titleSuggestion.split(":")[1] || "").split(/,| e /).map(item => item.trim()).filter(Boolean);
  assert.ok(facetas.length <= 2, `${facetas.length} facetas: o título voltou a ser lista`);
  assert.ok(model.titleSuggestion.length < 90, `${model.titleSuggestion.length} caracteres: longo demais para um título`);

  /* B · a principal aparece UMA vez — não uma vez por faceta. */
  const ocorrencias = (model.titleSuggestion.toLowerCase().match(/pele oleosa/g) || []).length;
  assert.ok(ocorrencias <= 1, `"pele oleosa" aparece ${ocorrencias} vezes no título`);

  /*
   * O TÍTULO NÃO CARREGA O RECHEIO DO CABEÇALHO.
   *
   * "no dia a dia" existe para dar corpo a um H2 — num título ele só ocupa
   * espaço, e o espaço do título é o que decide se alguém o lê inteiro.
   */
  assert.equal(/no dia a dia|na pr(á|a)tica/i.test(model.titleSuggestion), false,
    `"${model.titleSuggestion}" carrega recheio de cabeçalho`);

  /* A · e nenhuma pergunta de busca sobreviveu inteira dentro dele. */
  assert.equal(model.titleSuggestion.includes("?"), false);
  for (const bruto of candidatosDaTela().map(item => item.workingTitle.toLowerCase())) {
    assert.equal(model.titleSuggestion.toLowerCase().includes(bruto), false,
      `o título carrega a query "${bruto}" inteira`);
  }
});

test("1.4·C · título, direção e promessa dizem coisas diferentes", () => {
  const model = modelo();

  const normalizado = (texto: string) => texto.toLowerCase().replace(/[^a-zà-ÿ ]/g, " ").replace(/\s+/g, " ").trim();
  const [titulo, direcao, promessa] = [model.titleSuggestion, model.editorialAngle, model.readerPromise].map(normalizado);

  assert.notEqual(titulo, direcao);
  assert.notEqual(direcao, promessa);
  assert.notEqual(titulo, promessa);

  /*
   * E A DIFERENÇA É SEMÂNTICA, não de comprimento.
   *
   * A versão anterior dizia a mesma coisa três vezes com palavras a mais. O que
   * separa as três é o PAPEL: o título nomeia, a direção organiza, a promessa
   * entrega.
   */
  assert.equal(direcao.includes(titulo), false, "a direção é o título esticado");
  assert.equal(promessa.includes(titulo), false, "a promessa é o título esticado");
  assert.match(model.editorialAngle, /Abrir pelo fundamento|Ir direto à aplicação|Organizar a leitura/);
  assert.match(model.readerPromise, /^Ao final, o leitor /);

  /* E as três continuam mudando com a arquitetura. */
  const outro = modelo({
    sections: [
      candidato({ titulo: "O que é a pele oleosa?", paginas: 7 }),
      candidato({ titulo: "Como escolher produtos para pele oleosa?", paginas: 6 }),
    ],
  });
  assert.notEqual(outro.titleSuggestion, model.titleSuggestion);
  assert.notEqual(outro.readerPromise, model.readerPromise);
});

test("1.4·D · os pontos a cobrir não são queries cruas", async () => {
  const model = modelo();

  for (const secao of todasAsSecoes(model)) {
    for (const ponto of secao.coveragePoints) {
      assert.equal(ponto.includes("?"), false, `"${ponto}" é pergunta`);
      assert.equal(/:\s*(o que|como|quais)/i.test(ponto), false, `"${ponto}" é artefato de busca da SERP`);
      assert.equal(/^o que (é|são)\b/i.test(ponto), false, `"${ponto}" não foi editorializado`);
      assert.equal(/^quais s(ã|a)o\b/i.test(ponto), false, `"${ponto}" não foi editorializado`);
      assert.equal(ponto === ponto.toUpperCase() && ponto.length > 4, false, `"${ponto}" é rótulo cru`);
    }
  }

  /* A definição virou substantivo, com a contração certa. */
  const definicional = model.sections.find(item => item.editorialFunction === "DEFINITION");
  assert.ok(definicional);
  assert.ok(
    definicional!.coveragePoints.some(ponto => /^características d[ao] /i.test(ponto)),
    `a definição não virou ponto editorial: ${definicional!.coveragePoints.join(" · ")}`,
  );

  /* E a formulação original continua inteira na evidência. */
  const tela = await montarModelo(model);
  const evidencias = tela.all("radar-article-model-evidence").map(item => item.textContent || "").join(" ");
  assert.match(evidencias, /Como cuidar da pele oleosa e com tendência a acne/);
  tela.destroy();
});

test("1.4·E e F · o bloco de acne tem um pai que representa o território", () => {
  const model = modeloComAcne();

  const bloco = model.sections.find(secao => secao.childSections.length >= 2 && /acne/i.test(secao.headingSuggestion));
  assert.ok(bloco, `nenhum bloco temático: ${model.sections.map(item => item.headingSuggestion).join(" | ")}`);

  /*
   * §5 · O PAI NÃO PODE SER UMA DAS FILHAS.
   *
   * "O que causa acne?" com três subseções sobre acne diz que o bloco é sobre
   * causas — quando ele é sobre a relação inteira. O guarda-chuva nomeia o
   * território: assunto do artigo + tema.
   */
  assert.match(bloco!.headingSuggestion, /^Pele oleosa e acne/i);
  assert.equal(bloco!.level, 2);

  /* E a necessidade original continua inteira, uma subseção abaixo. */
  const filhas = bloco!.childSections.map(item => item.headingSuggestion).join(" | ");
  assert.match(filhas, /rela(ç|c)(ã|a)o/i, "a relação entre oleosidade e acne continua no bloco");
  for (const filha of bloco!.childSections) {
    assert.equal(filha.level, 3);
    assert.equal(filha.parentId, bloco!.id);
  }

  /* E · CAUSE_UNDER_APPLICATION = NO continua valendo. */
  const eixo = model.sections.find(item => item.editorialFunction === "APPLICATION");
  for (const filha of eixo?.childSections || []) {
    assert.notEqual(filha.editorialFunction, "EXPLANATION", "causa pendurada no passo a passo");
  }

  /*
   * E O CABEÇALHO DE UMA CAUSA NÃO PROMETE PASSO A PASSO.
   *
   * "Como surge a acne hormonal NO DIA A DIA?" classificava certo e prometia
   * errado: a frase anuncia rotina e o conteúdo é explicação.
   */
  for (const secao of todasAsSecoes(model).filter(item => item.editorialFunction === "EXPLANATION")) {
    assert.equal(/no dia a dia|na pr(á|a)tica\?/i.test(secao.headingSuggestion), false,
      `"${secao.headingSuggestion}" promete aplicação e entrega explicação`);
  }

  /*
   * O RÓTULO DO BLOCO É PALAVRA, NÃO RADICAL.
   *
   * Com um tema cuja grafia difere do radical — "hidratação" vira "hidrat" —
   * um rótulo montado com o radical produziria "pele oleosa e hidrat".
   */
  const comHidratacao = modelo({
    sections: [
      candidato({ titulo: "O que é a pele oleosa?", paginas: 7 }),
      candidato({ titulo: "Como cuidar de pele oleosa?", paginas: 6 }),
      candidato({ titulo: "Por que a rotina precisa de hidratação?", paginas: 4 }),
      candidato({ titulo: "Quando mudar a hidratação?", paginas: 3 }),
      candidato({ titulo: "O que a falta de hidratação causa?", paginas: 3 }),
    ],
  });
  const blocoHidratacao = comHidratacao.sections.find(secao => secao.childSections.length >= 2);
  assert.ok(blocoHidratacao, "o tema com grafia diferente do radical formou bloco");
  {
    assert.equal(/hidrat\b/i.test(blocoHidratacao.headingSuggestion), false,
      `"${blocoHidratacao!.headingSuggestion}" usa o radical em vez da palavra`);
    assert.match(blocoHidratacao!.headingSuggestion, /hidrata(ç|c)(ã|a)o/i);
  }
});

test("1.4·G · MUST_COVER continua preservado dentro do bloco", () => {
  const model = modeloComAcne();
  const hormonal = vereditoDe(model, "Como surge a acne hormonal?");

  assert.ok(hormonal, "o assunto declarado foi avaliado");
  assert.equal(hormonal!.dnaRequired, true);
  assert.equal(hormonal!.verdict, "PROMOTED", "DNA_REQUIRED continua significando MUST_COVER");
  assert.ok(hormonal!.sectionId, "e ele tem endereço no artigo");

  /* DNA_REQUIRED_FORCES_HEADING = NO: o lugar é decisão da arquitetura. */
  const todas = todasAsSecoes(model);
  const comoSecao = todas.find(secao => secao.id === hormonal!.sectionId);
  assert.ok(comoSecao, "o endereço existe");
  assert.notEqual(comoSecao!.level, 2, "não virou eixo por decreto");
});

test("1.4·H · nenhum texto solto sobra na área FINALIZED", async () => {
  const fonte = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  const inicio = fonte.indexOf("{areaGoogle && <>");
  const fim = fonte.indexOf("{plannerHandoff && !areaGoogle && <PlannerHandoff", inicio);
  const area = fonte.slice(inicio, fim);

  /*
   * §9 · A TELEMETRIA DA COLETA ENTROU NO DISCLOSURE.
   *
   * Keywords, consultas, referências e suficiência abriam a área, antes do
   * briefing — e "Amostra competitiva parcial" flutuava no rodapé, ao lado de
   * "Zerar investigação", sem dizer a que se referia.
   */
  const evidencia = area.indexOf('data-testid="radar-competitive-evidence"');
  const resumo = area.indexOf('data-testid="radar-research-summary"');
  const artigo = area.indexOf("<RadarArticleModelSection");
  assert.ok(resumo > evidencia, "a telemetria mora dentro da evidência competitiva");
  assert.ok(artigo < evidencia, "e o briefing continua na frente");

  /* A manchete de suficiência não volta como dica órfã da ação finalizada. */
  const fase1 = await readFile(new URL("../lib/radar/serp-phase1.ts", import.meta.url), "utf8");
  const trecho = fase1.slice(fase1.indexOf('input.state === "FINALIZED"'), fase1.indexOf('input.state === "FINALIZED"') + 900);
  assert.equal(/hint: input\.sufficiency\?\.headline/.test(trecho), false, "LOOSE_FINALIZED_UI_TEXT = 0");
});

test("1.4·I e J · evidência e proveniência intactas, e nenhum UUID fora delas", async () => {
  const model = modeloComAcne();

  /* I · cada seção continua apontando para os candidatos que a sustentam. */
  for (const secao of todasAsSecoes(model)) {
    assert.ok(secao.evidenceRefs.length > 0, `${secao.headingSuggestion} sem evidência apontada`);
    for (const ref of secao.evidenceRefs) {
      assert.ok(model.candidates.some(item => item.id === ref), `${ref} perdeu o candidato`);
    }
  }
  assert.ok(model.candidates.every(item => item.reason.length > 10), "todo candidato mantém o motivo");

  /* J · NORMAL_VIEW_UUIDS = 0 */
  const tela = await montarModelo(model);
  const texto = tela.text();
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(texto), false);
  for (const proibido of ["section:", "umbrella:", "candidate-", "concept-", "article:article-candidate"]) {
    assert.equal(texto.includes(proibido), false, `"${proibido}" vazou para a leitura`);
  }
  tela.destroy();
});

test("1.4·§8 · a força da evidência tem uma apresentação só", async () => {
  const tela = await montarModelo(modelo());

  for (const selos of tela.all("radar-article-model-badges")) {
    const texto = selos.textContent || "";
    assert.equal(
      /Evidência suficiente/.test(texto) && /Evidência moderada/.test(texto),
      false,
      `dois selos sobre a mesma pergunta: "${texto}"`,
    );
  }
  tela.destroy();
});

test("1.4·§10 · o briefing se entende com todos os disclosures fechados", async () => {
  const model = modeloComAcne();
  const tela = await montarModelo(model);

  const visivel = (() => {
    const copia = tela.container.cloneNode(true) as HTMLElement;
    for (const details of [...copia.querySelectorAll("details")]) {
      const resumo = details.querySelector("summary");
      details.replaceChildren(...(resumo ? [resumo] : []));
    }
    return copia.textContent || "";
  })();

  assert.ok(visivel.includes(model.titleSuggestion), "título de trabalho");
  assert.ok(visivel.includes(model.readerPromise), "promessa");
  assert.ok(visivel.includes(model.editorialAngle), "direção");
  assert.match(visivel, /Hook/, "abertura");
  for (const secao of model.sections) {
    assert.ok(visivel.includes(secao.headingSuggestion), `H2 ${secao.headingSuggestion}`);
    for (const filho of secao.childSections) assert.ok(visivel.includes(filho.headingSuggestion), `H3 ${filho.headingSuggestion}`);
  }
  assert.match(visivel, /Links internos/, "links resumidos");

  /* E nenhuma estatística de SERP é necessária para interpretar o briefing. */
  assert.equal(/\d+ de \d+ p(á|a)gina|consulta(s)? distinta|formula(ç|c)(õ|o)es/i.test(visivel), false);
  tela.destroy();
});
