import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertRadarAiDiscoveryAuthority, buildRadarAiDiscoveryContext, radarAiDiscoveryLines, radarDeclaredFunnel,
} from "../lib/radar/ai-discovery-context.ts";
import { buildRadarSemanticConceptModel } from "../lib/radar/semantic-concept-model.ts";
import { buildRadarCompetitiveModel } from "../lib/radar/competitive-model.ts";
import { buildRadarEditorialComparison } from "../lib/radar/editorial-comparison.ts";
import { buildRadarCompetitiveObservedModel, radarObservedNarrative } from "../lib/radar/competitive-observed-model.ts";
import { buildRadarEvidenceBundle, radarEvidenceBundleAiDiscovery } from "../lib/radar/evidence-bundle.ts";
import { buildRadarEvidenceClaims } from "../lib/radar/claim-evidence.ts";
import { buildRadarFactualEvidence, classifyRadarSourceAuthority } from "../lib/radar/source-authority.ts";
import { assessRadarYmylRelevance } from "../lib/radar/editorial-policy.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";

/*
 * ==========  GATE 13 · DESCOBERTA NA BUSCA E COMPREENSÃO POR IA  =========
 *
 * O artigo é um só. Quem responde com clareza, nomeia as entidades certas e
 * organiza os conceitos é compreendido por quem busca e por quem interpreta —
 * e é por isso que a maioria das exigências daqui é compartilhada.
 *
 * O que este arquivo guarda:
 *
 *   a SERP continua com a voz mais alta;
 *   leitura interpretativa opina e não decide;
 *   cobertura de mercado não substitui sustentação factual;
 *   nenhuma nota, nenhum tamanho mágico, nenhum serviço externo.
 *
 * Nenhum teste chama rede: a camada inteira é determinística.
 */

/* =============================== a fixture ============================== */

const link = (patch: Partial<RadarObservedLink> = {}): RadarObservedLink => ({
  destinationUrl: "https://www.aad.org/public/diseases/oily-skin",
  destinationDomain: "www.aad.org",
  kind: "EXTERNAL", anchorText: "American Academy of Dermatology",
  surroundingText: "A produção de sebo é regulada por hormônios.",
  sectionHeading: "Por que a pele fica oleosa?", rel: [], target: null, order: 0,
  ...patch,
});

const pagina = (id: string, headings: string[], patch: Partial<RadarExtractionPage> = {}): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [],
  wordCount: 1600, internalLinkCount: 3, externalLinkCount: 1,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Na prática, testamos a rotina por oito semanas.", closingWordCount: 40,
  closingText: "Fecho.", hasClosing: true, emphasizedTerms: [], keywordPlacement: null,
  observedLinks: [link()], error: null,
  ...patch,
});

/*
 * CATORZE COMPARÁVEIS, QUATRO NECESSIDADES E O RUÍDO REAL DE UMA AMOSTRA.
 *
 * A identificação aparece sob três formulações diferentes de propósito: é ela
 * que prova que variação lexical não vira necessidade duplicada. E as duas
 * últimas páginas trazem o que só uma delas diz — o material dos testes de
 * isolamento.
 */
const identificacao = ["Como identificar a pele oleosa?", "Como saber se a pele é oleosa?", "Quais são os sinais de pele oleosa?"];

const PAGINAS: RadarExtractionPage[] = Array.from({ length: 14 }, (_, index) => {
  const headings = [identificacao[index % 3]];
  if (index < 11) headings.push("Por que a pele fica oleosa?");
  if (index < 12) headings.push("Sebo e oleosidade da pele");
  if (index < 8) headings.push("O que é pele oleosa?");
  if (index < 10) headings.push("Rotina de cuidados para pele oleosa");
  if (index < 9) headings.push("Riscos do ácido salicílico para pele oleosa na gravidez");
  if (index === 13) headings.push("Niacinamida para pele oleosa", "A pele oleosa envelhece mais devagar?");
  return pagina(`A${index}`, headings);
});

const contexto = (patch: { funnel?: string; topics?: string[]; intent?: string } = {}): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "b", articleId: "a", articleDnaVersionId: "dna-v13", articleDnaContentHash: "hash-v13",
    promise: "Skincare para pele oleosa", mainIntent: patch.intent ?? "informacional", hierarchy: "Pilar",
  },
  keywords: [{
    identity: { keywordId: "kw1", text: "skincare para pele oleosa", role: "principal" },
    strategy: {
      keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } },
      semanticQualification: { versionId: "sq-1", intent: "informacional", funnel: patch.funnel ?? "TOFU" },
      normalizedIntent: "informacional",
    },
  }],
  editorialTopics: patch.topics ?? ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: null, formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

type ObservedInput = Parameters<typeof buildRadarCompetitiveObservedModel>[0];

function observado(extra: Partial<ObservedInput> = {}, patch: Parameters<typeof contexto>[0] = {}) {
  const context = contexto(patch);
  const pages = (extra.pages as RadarExtractionPage[] | undefined) || PAGINAS;
  const structural = buildRadarCompetitiveModel({
    pages, query: "skincare para pele oleosa", principal: "skincare para pele oleosa",
    editorialTopics: context.editorialTopics, keywordTexts: context.resolvedKeywordTexts, centralEntities: ["pele oleosa"],
  });
  const comparison = buildRadarEditorialComparison({ context, model: structural, observedIntent: "informacional" });
  return buildRadarCompetitiveObservedModel({
    context, references: [], selectedUrls: [], pages, structural, comparison,
    diagnostic: { dominantIntent: "informacional", dominantFormats: ["article"] },
    observedAt: "2026-09-10T12:00:00.000Z",
    ...extra,
  });
}

const descoberta = (extra: Partial<ObservedInput> = {}, patch: Parameters<typeof contexto>[0] = {}) =>
  observado(extra, patch).aiDiscovery;

/* ===================  A e B · QUANDO A CAMADA SE APLICA  ================ */

test("GATE 13 · A — topo de funil torna a descoberta obrigatória", () => {
  const contexto13 = descoberta();

  assert.equal(contexto13.funnel.read, "TOFU", "o estágio veio do fundamento");
  assert.equal(contexto13.applicability, "REQUIRED");
  assert.equal(contexto13.applicable, true, "AI_DISCOVERY_APPLICABLE");
  assert.equal(contexto13.required, true);
  assert.ok(contexto13.answerableUnits.length > 0, "com unidades fundamentadas");

  /* SEARCH_AND_AI_SHARED_CONTEXT: um conjunto só, e a maioria serve aos dois. */
  assert.ok(contexto13.matrix.shared > 0);
  assert.ok(contexto13.matrix.shared > contexto13.matrix.aiDiscovery, "a maioria é compartilhada");

  /* O funil é lido, nunca reescrito. */
  assert.equal(radarDeclaredFunnel(contexto()).declared, "TOFU");
});

test("GATE 13 · B — fundo de funil não recebe o conjunto obrigatório do topo", () => {
  /*
   * A MESMA AMOSTRA, OUTRO ESTÁGIO — de propósito.
   *
   * Trocar a evidência junto com o funil provaria pouco: qualquer diferença
   * poderia vir das páginas. Com a evidência idêntica, o que muda só pode ter
   * vindo do estágio que o fundamento declarou.
   */
  const bofu = descoberta({}, { funnel: "BOFU" });

  assert.equal(bofu.funnel.read, "BOFU");
  assert.equal(bofu.required, false, "BOFU_AI_DISCOVERY_FORCED = NO");
  assert.equal(bofu.applicability, "CONTEXTUAL");

  /* O que é exigência de clareza do topo não aparece; o observado permanece. */
  const tipos = new Set(bofu.retrievabilityRequirements.map(item => item.kind));
  assert.equal(tipos.has("PASSAGE_INDEPENDENCE"), false, "a independência de trecho é exigência do topo");
  if (bofu.applicable) assert.ok(tipos.has("DIRECT_ANSWER"), "o que a amostra mostra continua valendo");

  /* E o topo, por contraste, exige. */
  assert.ok(new Set(descoberta().retrievabilityRequirements.map(item => item.kind)).has("PASSAGE_INDEPENDENCE"));

  /* Sem funil e sem intenção informacional, a camada assume que não sabe. */
  const semFunil = descoberta({}, { funnel: "", intent: "transacional" });
  assert.equal(semFunil.applicability, "UNDETERMINED");
  assert.equal(semFunil.applicable, false);
  assert.ok(semFunil.limitations.some(item => /não foi declarado/.test(item)));
});

/* =============  C, D, E e F · AS UNIDADES DE RESPOSTA  ================= */

test("GATE 13 · C — conceito recorrente na busca vira necessidade central", () => {
  const contexto13 = descoberta();
  const central = contexto13.answerableUnits.find(unit => /identificar|sinais|oleosa é|é oleosa/i.test(unit.questionOrNeed));

  assert.ok(central, "a identificação está entre as necessidades");
  assert.equal(central?.importance, "CORE");
  assert.equal(central?.marketRecurrence.recurrence, "STRONG");
  assert.ok((central?.marketRecurrence.pages || 0) >= 8, "sustentada pela maioria da amostra");
  assert.ok(central?.marketRecurrence.competitors.length, "com os concorrentes nomeados");

  const direto = contexto13.retrievabilityRequirements.find(item => item.kind === "DIRECT_ANSWER" && item.unitIds.includes(central?.id || ""));
  assert.ok(direto, "e produz exigência de resposta direta");
  assert.equal(direto?.basis, "OBSERVED");
  assert.equal(direto?.scope, "SHARED");
});

test("GATE 13 · D — necessidade isolada não vira central nem exigência automática", () => {
  const contexto13 = descoberta();
  const isolada = contexto13.answerableUnits.find(unit => /envelhece/i.test(unit.questionOrNeed));

  assert.ok(isolada, "a necessidade isolada continua registrada");
  assert.notEqual(isolada?.importance, "CORE");
  assert.equal(isolada?.marketRecurrence.pages, 1);

  const pergunta = contexto13.questions.find(item => /envelhece/i.test(item.question));
  assert.deepEqual(pergunta?.classes, ["UNDERCOVERED_QUESTION"]);
  assert.equal(
    contexto13.questionCoverageRequirements.some(item => /envelhece/i.test(item.question)),
    false,
    "uma página perguntando não é o mercado perguntando",
  );

  /* E o que nem fala do assunto do artigo fica de fora, com o motivo escrito. */
  assert.ok(contexto13.excluded.length >= 0);
  for (const item of contexto13.excluded) assert.ok(item.reason.length > 20, "toda ausência é declarada");
});

test("GATE 13 · E — o agrupamento de perguntas alimenta as unidades", () => {
  const contexto13 = descoberta();
  const porPergunta = contexto13.answerableUnits.filter(unit => unit.origin === "QUESTION_CLUSTER");

  assert.ok(porPergunta.length >= 2, "as perguntas recorrentes viraram necessidades");
  for (const unit of porPergunta) {
    assert.ok(unit.questionRecurrence, "a formulação como pergunta é preservada");
    assert.ok(unit.provenance.some(item => item.origin === "QUESTION_CLUSTER"));
  }

  /* A causa é uma delas, e chega com a leitura de tipo que o Gate 8 fez. */
  const causa = contexto13.answerableUnits.find(unit => /por que/i.test(unit.questionOrNeed));
  assert.equal(causa?.concept.type, "CAUSE");
  assert.ok(contexto13.conceptRelations.some(item => item.kind === "CAUSE_OF"), "e vira relação observada");
});

test("GATE 13 · F — variação lexical não duplica a necessidade", () => {
  const contexto13 = descoberta();

  /*
   * Três formulações da mesma necessidade na amostra. Se cada uma virasse uma
   * unidade, o Planejador receberia três dívidas onde existe uma — e a
   * primeira decisão do Gate 8 teria sido desfeita aqui.
   */
  const identificam = contexto13.answerableUnits.filter(unit => unit.concept.type === "ATTRIBUTE");
  assert.equal(identificam.length, 1, "uma necessidade, não três");
  assert.ok((identificam[0].questionRecurrence?.variants || 0) >= 2, "com as formulações preservadas");

  const ids = contexto13.answerableUnits.map(unit => unit.id);
  assert.equal(new Set(ids).size, ids.length, "e nenhuma identidade repetida");
});

/* ==================  G e H · ENTIDADES E RELAÇÕES  ===================== */

test("GATE 13 · G — a relação entre entidades é preservada, não resolvida", () => {
  const contexto13 = descoberta();
  const sebo = contexto13.entityContext.related.find(item => /sebo/i.test(item.label));

  assert.ok(sebo, "sebo aparece como entidade relacionada");
  assert.equal(sebo?.relation, "related_to", "relacionada ao assunto, não igual a ele");
  assert.notEqual(sebo?.relatedTo, sebo?.label);

  const relacao = contexto13.conceptRelations.find(item => item.kind === "RELATED_TO" && /sebo/i.test(item.subject));
  assert.ok(relacao, "e a relação chega ao Planejador com a evidência");
  assert.ok(relacao?.pages && relacao.pages >= 2);

  /* Distinguir os dois é exigência de clareza, e ela é nomeada. */
  assert.ok(contexto13.entityContext.disambiguationNeeds.some(item => /sebo/i.test(item.label)));
  assert.ok(contexto13.retrievabilityRequirements.some(item => item.kind === "REFERENTIAL_CLARITY" && /sebo/i.test(item.subject)));
});

test("GATE 13 · H — entidade de sinal fraco não vira exigência de cobertura", () => {
  const contexto13 = descoberta();

  const exigencias = contexto13.entityCoverageRequirements.map(item => item.label.toLowerCase());
  assert.equal(exigencias.some(label => /niacinamida/.test(label)), false, "vista uma vez não é obrigação");
  assert.ok(
    contexto13.excluded.some(item => /niacinamida/i.test(item.subject)),
    "mas a ausência é declarada, não silenciosa",
  );

  /* Toda exigência que sobrou tem sustentação de mais de uma página, ou é do fundamento. */
  for (const requisito of contexto13.entityCoverageRequirements) {
    assert.ok(requisito.pages >= 2 || requisito.role === "PRIMARY", requisito.label);
    assert.notEqual(requisito.confidence, "LOW");
  }

  /*
   * FRAGMENTO DE EXPRESSÃO NÃO VIRA TRÊS EXIGÊNCIAS.
   *
   * "ácido salicílico na gravidez" chega da extração como três termos com
   * exatamente as mesmas páginas de origem. Três exigências ali seriam três
   * dívidas onde existe uma, e duas delas seriam metade de um termo.
   */
  assert.equal(exigencias.filter(label => /acido|salicilico|gravidez/.test(label)).length, 1, "uma exigência para a expressão inteira");
  const expressao = contexto13.entityCoverageRequirements.find(item => /acido|salicilico|gravidez/.test(item.label));
  assert.match(expressao?.requirement || "", /com .*(acido|gravidez)/, "e os companheiros viajam junto");
  assert.ok(contexto13.limitations.some(item => /termo a termo/.test(item)), "com a limitação declarada");
});

/* ===========  I, J e K · SUSTENTAÇÃO FACTUAL E ESPECIALISTA  =========== */

test("GATE 13 · I — sem fonte adequada, a necessidade sensível não sai pronta", () => {
  const contexto13 = descoberta();
  const gravidez = contexto13.answerableUnits.find(unit => /gravidez/i.test(unit.questionOrNeed));

  assert.ok(gravidez, "a afirmação sensível virou necessidade");
  assert.equal(gravidez?.factualEvidenceRequirement.ymylRelevance, "HIGH");
  assert.equal(gravidez?.factualEvidenceRequirement.support, "MISSING");
  assert.equal(gravidez?.answerability, "EVIDENCE_REQUIRED");
  assert.equal(gravidez?.readiness, "NOT_READY", "nove concorrentes não sustentam um fato");
  assert.equal(gravidez?.blockedBy, "FACTUAL_EVIDENCE");
  assert.match(gravidez?.readinessReason || "", /cobertura de mercado não sustenta o fato/);

  /* A cobertura de mercado dela é forte — e não é isso que decide. */
  assert.equal(gravidez?.marketRecurrence.recurrence, "STRONG");
  assert.ok(contexto13.limitations.some(item => /sem fonte adequada/.test(item)));
});

test("GATE 13 · J — o ponto de revisão do especialista chega ligado à necessidade", () => {
  const contexto13 = descoberta();
  const gravidez = contexto13.answerableUnits.find(unit => /gravidez/i.test(unit.questionOrNeed));

  /*
   * O QUE O MERCADO CITA CHEGA JUNTO — como ponto de partida, não como fonte.
   *
   * Quem for buscar sustentação para esta necessidade começa sabendo o que os
   * concorrentes citam ao tratar dela. Nenhum desses destinos foi acessado, e
   * recorrência não é atestado de autoridade.
   */
  assert.ok(gravidez?.factualEvidenceRequirement.candidateSources.length, "as candidatas observadas viajam com a necessidade");
  assert.deepEqual(gravidez?.factualEvidenceRequirement.sources, [], "e nenhuma delas foi verificada ainda");

  assert.ok(gravidez?.specialistRequirement, "a necessidade sabe quem pode resolvê-la");
  assert.ok(gravidez?.specialistRequirement?.question.length > 40, "e a pergunta chega contextualizada");
  assert.equal(
    contexto13.specialistConnections.some(item => item.unitId === gravidez?.id),
    true,
    "SPECIALIST_REQUIREMENTS_CONNECTED",
  );
  for (const conexao of contexto13.specialistConnections) {
    assert.ok(conexao.requirementId.startsWith("specialist:"), "o identificador é o do Gate 12, não um novo");
  }
});

test("GATE 13 · K — fonte verificada e interpretada muda o estado da necessidade", () => {
  const context = contexto();
  const semantic = buildRadarSemanticConceptModel({
    pages: PAGINAS, centralEntities: ["pele oleosa"], keywordTexts: ["skincare para pele oleosa"],
  });
  const claims = buildRadarEvidenceClaims({ semantic, articleYmyl: assessRadarYmylRelevance(context) });
  const claim = claims.find(item => /gravidez/i.test(item.canonicalClaim));
  assert.ok(claim, "a afirmação existe para receber a evidência");

  const fonte = pagina("PUBMED", ["Salicylic acid in pregnancy"], {
    url: "https://pubmed.ncbi.nlm.nih.gov/12345678/", title: "Topical salicylic acid exposure",
    metaDescription: "Topical use below 2% shows no measurable systemic absorption.",
  });
  const classification = classifyRadarSourceAuthority({ domain: "pubmed.ncbi.nlm.nih.gov", url: fonte.url, verifiedPage: fonte });
  const evidencia = buildRadarFactualEvidence({
    claim: claim!, page: fonte, classification,
    reading: { supportType: "SUPPORTS", summary: "Uso tópico abaixo de 2% sem absorção sistêmica mensurável.", readBy: "especialista" },
  });

  const comEvidencia = descoberta({ verifiedSources: [classification], factualEvidence: [evidencia] });
  const gravidez = comEvidencia.answerableUnits.find(unit => /gravidez/i.test(unit.questionOrNeed));

  assert.equal(gravidez?.factualEvidenceRequirement.support, "ADEQUATE", "EVIDENCE_AVAILABLE");
  assert.ok(gravidez?.factualEvidenceRequirement.sources.includes("pubmed.ncbi.nlm.nih.gov"));
  assert.equal(gravidez?.readiness, "READY");
  assert.equal(comEvidencia.factualCoverage.adequate >= 1, true);

  /*
   * O ponto de especialista continua — e não bloqueia mais.
   *
   * Sustentada, a afirmação passa a pedir a leitura prática, não a resolução
   * de uma dúvida. Tratar as duas como impedimento faria toda necessidade bem
   * sustentada parecer incompleta.
   */
  assert.equal(gravidez?.specialistRequirement?.kind, "VERIFY_AND_ADD_EXPERIENCE");
});

/* ===========  L e M · A SERP ACIMA DA LEITURA INTERPRETATIVA  ========== */

test("GATE 13 · L — leitura interpretativa não remove requisito sustentado pela busca", () => {
  const base = descoberta();
  const central = base.answerableUnits.find(unit => unit.importance === "CORE");
  assert.ok(central, "há uma necessidade central para a leitura tentar remover");

  const comLeitura = descoberta({
    heuristicReadings: [{
      subject: central!.questionOrNeed,
      reading: "Esta pergunta não parece adequada para extração automática e poderia sair do conjunto.",
      wouldSuppress: true,
      provenance: "Leitura interpretativa da camada de descoberta.",
    }],
  });

  const sobreviveu = comLeitura.answerableUnits.find(unit => unit.questionOrNeed === central!.questionOrNeed);
  assert.ok(sobreviveu, "HEURISTIC_CAN_REMOVE_SERP_REQUIREMENT = NO");
  assert.ok(comLeitura.retrievabilityRequirements.some(item => item.kind === "DIRECT_ANSWER" && item.subject === central!.questionOrNeed));

  assert.equal(comLeitura.conflicts.length, 1, "e a divergência fica registrada");
  const conflito = comLeitura.conflicts[0];
  assert.equal(conflito.domain, "COMPETITIVE");
  assert.equal(conflito.prevailing.source, "CURRENT_SUFFICIENT_SERP", "SERP_PRECEDENCE_ENFORCED");
  assert.ok(conflito.overruled.some(item => item.source === "AI_INTERPRETATION"), "o lado que perdeu continua escrito");
  assert.ok(conflito.overruled.every(item => item.reason.length > 20));

  /* Nada some em silêncio: os dois lados chegam à leitura de quem opera. */
  assert.ok(radarAiDiscoveryLines(comLeitura).some(linha => /Divergência registrada/.test(linha)));
});

test("GATE 13 · M — leitura sem evidência não vira exigência competitiva", () => {
  const contexto13 = descoberta({
    heuristicReadings: [{
      subject: "tom de voz",
      reading: "Um resumo em tópicos no começo tende a ajudar sistemas de leitura.",
      provenance: "Leitura interpretativa da camada de descoberta.",
    }],
  });

  const proposta = contexto13.potentialClarityImprovements.find(item => item.subject === "tom de voz");
  assert.ok(proposta, "a leitura é registrada como possibilidade");
  assert.equal(proposta?.basis, "HEURISTIC");
  assert.match(proposta?.note || "", /nunca como exigência/);

  assert.equal(
    contexto13.retrievabilityRequirements.some(item => /tom de voz/.test(item.subject)),
    false,
    "e não entra no conjunto de requisitos",
  );
  for (const requisito of contexto13.retrievabilityRequirements) {
    assert.notEqual(requisito.basis, "HEURISTIC", requisito.kind);
  }

  /* A invariante é executável: um requisito heurístico forjado é erro. */
  assert.throws(
    () => assertRadarAiDiscoveryAuthority({
      ...contexto13,
      retrievabilityRequirements: [{
        kind: "DIRECT_ANSWER", subject: "x", requirement: "x", scope: "SHARED",
        origin: "HEURISTIC", basis: "HEURISTIC", unitIds: [], evidence: "x", provenance: "x",
      }],
    }),
    /RADAR_DISCOVERY_REQUIREMENT_WITHOUT_EVIDENCE/,
  );
});

/* =============  N e O · SEM MOLDE, SEM TAMANHO, SEM ENFEITE  =========== */

test("GATE 13 · N — resposta direta não carrega tamanho mágico nem posição fixa", () => {
  const contexto13 = descoberta();
  const diretos = contexto13.retrievabilityRequirements.filter(item => item.kind === "DIRECT_ANSWER");
  assert.ok(diretos.length > 0);

  for (const requisito of diretos) {
    assert.equal(/\d+\s*(palavras|caracteres)/i.test(requisito.requirement), false, requisito.subject);
    assert.equal(/\bH[23]\b/.test(requisito.requirement), false, "nem estrutura final");
  }

  const fonte = readFileSync("lib/radar/ai-discovery-context.ts", "utf8");
  assert.equal(/wordCount|maxWords|minWords|40 palavras|snippet/i.test(fonte), false, "nenhum tamanho fixado no módulo");
  assert.equal(/posição 2|H2 obrigat/i.test(fonte), false, "nenhuma posição prescrita");

  /*
   * A oportunidade de resposta cedo existe — e é observação, com a conta à
   * vista, nunca uma regra de posição.
   */
  for (const cedo of contexto13.retrievabilityRequirements.filter(item => item.kind === "EARLY_ANSWER_OPPORTUNITY")) {
    assert.equal(cedo.basis, "OBSERVED");
    assert.match(cedo.evidence, /de \d+ página/);
  }
});

test("GATE 13 · O.2 — havendo comparação, os critérios saem da própria amostra", () => {
  /*
   * A fixture do topo não compara nada, e é por isso que ela prova a ausência.
   * Esta prova o outro lado: com comparação observada, o requisito nasce — e
   * nasce com as dimensões que a amostra usa, não com uma grade inventada.
   */
  const comComparacao = PAGINAS.map((page, index) => index < 8 ? {
    ...page,
    h2: [...page.h2, "Sérum vs hidratante para pele oleosa"],
    headingOutline: [...page.headingOutline, { level: 2 as const, text: "Sérum vs hidratante para pele oleosa" }],
  } : page);

  const contexto13 = descoberta({ pages: comComparacao });
  const criterios = contexto13.retrievabilityRequirements.find(item => item.kind === "COMPARISON_CRITERIA");

  assert.ok(criterios, "a comparação recorrente pede critérios explícitos");
  assert.equal(criterios?.basis, "OBSERVED");
  assert.match(criterios?.requirement || "", /critérios/);
  assert.match(criterios?.provenance || "", /dimensão\(ões\) recorrente\(s\)/);

  const tabela = contexto13.retrievabilityRequirements.find(item => item.kind === "STRUCTURED_FORMAT" && /tabela/.test(item.requirement));
  assert.ok(tabela, "e a tabela aparece porque a informação é dimensional");
  assert.match(tabela?.requirement || "", /\d+ critério/);
  assert.equal(tabela?.basis, "OBSERVED");

  /* A unidade correspondente é de comparação — nada de tabela em cima de prosa. */
  const unidade = contexto13.answerableUnits.find(unit => tabela?.unitIds.includes(unit.id));
  assert.equal(unidade?.concept.type, "COMPARISON");
});

test("GATE 13 · O — lista e tabela seguem o tipo da informação, não o gosto presumido", () => {
  const contexto13 = descoberta();
  const formatos = contexto13.retrievabilityRequirements.filter(item => item.kind === "STRUCTURED_FORMAT");

  for (const formato of formatos) {
    assert.equal(formato.basis, "OBSERVED", formato.subject);
    const unidade = contexto13.answerableUnits.find(unit => formato.unitIds.includes(unit.id));
    assert.ok(
      !unidade || unidade.concept.type === "PROCESS" || unidade.concept.type === "COMPARISON",
      "só sequência e comparação justificam formato estruturado",
    );
  }

  /*
   * Sem comparação na amostra, não há critério nem tabela. A amostra desta
   * fixture não compara nada: uma tabela aqui seria enfeite.
   */
  assert.equal(contexto13.retrievabilityRequirements.some(item => item.kind === "COMPARISON_CRITERIA"), false);
  assert.equal(formatos.some(item => /tabela/i.test(item.requirement)), false);
});

/* ============  P, Q, R, S e T · FUNDAMENTO, PROCEDÊNCIA, ENTREGA  ====== */

test("GATE 13 · P — o fundamento é lido e nunca alterado", () => {
  const antes = contexto();
  const copia = JSON.parse(JSON.stringify(antes));
  const contexto13 = descoberta();

  assert.deepEqual(JSON.parse(JSON.stringify(contexto())), copia, "ARTICLE_UPSTREAM_MUTATED = NO");
  assert.equal(contexto13.binding.articleDnaVersionId, "dna-v13");
  assert.equal(contexto13.binding.articleDnaContentHash, "hash-v13");

  const fonte = readFileSync("lib/radar/ai-discovery-context.ts", "utf8");
  assert.equal(/context\.article\.\w+\s*=/.test(fonte), false, "nada aqui escreve no fundamento");
  assert.equal(/funnel\s*=\s*"(TOFU|MOFU|BOFU)"/.test(fonte), false, "e o funil não é reclassificado");
});

test("GATE 13 · Q — nenhum requisito viaja sem procedência", () => {
  const contexto13 = descoberta();

  for (const unit of contexto13.answerableUnits) {
    assert.ok(unit.provenance.length, unit.id);
    for (const item of unit.provenance) {
      assert.ok(item.detail.trim().length > 10, unit.id);
      assert.ok(["SERP", "ARTICLE_DNA", "SEMANTIC_CONCEPT", "QUESTION_CLUSTER", "FACTUAL_EVIDENCE", "SPECIALIST_REQUIREMENT", "HEURISTIC"].includes(item.origin));
    }
  }
  for (const requisito of contexto13.retrievabilityRequirements) {
    assert.ok(requisito.provenance.trim().length > 10, requisito.kind);
    assert.ok(requisito.evidence.trim().length > 10, requisito.kind);
  }
  for (const requisito of contexto13.questionCoverageRequirements) assert.ok(requisito.provenance.trim().length > 10);
  for (const relacao of contexto13.conceptRelations) assert.ok(relacao.provenance.trim().length > 10);
  for (const definicao of contexto13.definitionRequirements) assert.ok(definicao.provenance.trim().length > 10);

  /* A invariante é executável, não uma convenção de revisão. */
  assert.throws(
    () => assertRadarAiDiscoveryAuthority({
      ...contexto13,
      conceptRelations: [{ ...contexto13.conceptRelations[0], provenance: "  " }],
    }),
    /RADAR_DISCOVERY_PROVENANCE_LOST/,
  );
});

test("GATE 13 · R — a camada entra no dossiê serializável, amarrada ao fundamento", () => {
  const modelo = observado();
  const bundle = buildRadarEvidenceBundle({ observed: modelo, serp: { current: true, sufficient: true, valid: true } });

  const camada = radarEvidenceBundleAiDiscovery(bundle);
  assert.equal(camada.binding.articleId, bundle.binding.articleId);
  assert.equal(camada.binding.articleDnaVersionId, bundle.binding.articleDnaVersionId);
  assert.equal(camada.binding.articleDnaContentHash, bundle.binding.articleDnaContentHash);

  const round = JSON.parse(JSON.stringify(bundle));
  assert.equal(round.observed.aiDiscovery.answerableUnits.length, camada.answerableUnits.length, "RADAR_EVIDENCE_BUNDLE_UPDATED");
  assert.equal(round.observed.aiDiscovery.applicable, true);
  assert.ok(round.observed.aiDiscovery.matrix.shared > 0);

  /* Uma camada apontando para outra versão do fundamento não passa. */
  const forjado = {
    ...modelo,
    aiDiscovery: { ...modelo.aiDiscovery, binding: { ...modelo.aiDiscovery.binding, articleDnaVersionId: "dna-v12" } },
  };
  assert.throws(
    () => buildRadarEvidenceBundle({ observed: forjado, serp: { current: true, sufficient: true, valid: true } }),
    /RADAR_EVIDENCE_BUNDLE_DISCOVERY_ARTICLE_DNA_MISMATCH/,
  );

  /* O Planejador ainda não é ligado: o handoff continua fora deste gate. */
  assert.equal(/aiDiscovery/.test(readFileSync("lib/radar/planner-handoff.ts", "utf8")), false);
});

test("GATE 13 · S — a camada não conhece rede, serviço externo nem nota", () => {
  const fonte = readFileSync("lib/radar/ai-discovery-context.ts", "utf8");

  assert.equal(/\bfetch\s*\(|node-fetch|axios|https?:\/\/api\./i.test(fonte), false, "nenhuma chamada externa");
  assert.equal(/openai|anthropic|gemini|perplexity|serper|dataforseo/i.test(fonte), false, "nenhum provider");
  assert.equal(/aiScore|geoScore|aioScore|llmScore|citationScore/i.test(fonte), false, "AI_GEO_SCORE_CREATED = NO");
  assert.equal(/\bscore\b/i.test(fonte), false, "nem a palavra, para não voltar por descuido");
  assert.equal(/aiOverview|ai overview|chatgpt|copilot/i.test(fonte), false, "nenhuma raspagem de resposta de IA");

  /* O adaptador de enriquecimento continua onde estava, e desligado. */
  assert.equal(/RadarSemanticEnricher/.test(fonte), false, "e este gate não o liga");
});

test("GATE 13 · T — a leitura de quem opera nasce da mesma autoridade", () => {
  const modelo = observado();
  const secoes = radarObservedNarrative(modelo);
  const secao = secoes.find(item => item.title === "Descoberta e compreensão");

  assert.ok(secao, "a seção existe no mesmo relatório, sem redesenho");
  const texto = secao!.lines.join("\n");

  const centrais = modelo.aiDiscovery.answerableUnits.filter(unit => unit.importance === "CORE").length;
  assert.match(texto, /Perguntas centrais:/);
  assert.ok(centrais > 0);
  assert.match(texto, /Cobertura factual: \d+ sustentada/);
  assert.match(texto, new RegExp(`${modelo.aiDiscovery.factualCoverage.missing} sem fonte adequada`));

  /* Vocabulário de quem edita, não de quem opera modelo. */
  assert.equal(/prompt|LLM|embedding|token|vetor/i.test(texto), false);

  /* E a projeção é derivada, nunca um segundo cálculo. */
  assert.deepEqual(secao!.lines, radarAiDiscoveryLines(modelo.aiDiscovery));
});

/* ===================  §9 e §16 · DEFINIÇÃO E COBERTURA  ================ */

test("GATE 13 · definição só é exigida quando o resto depende dela", () => {
  const contexto13 = descoberta();

  for (const definicao of contexto13.definitionRequirements) {
    assert.ok(definicao.pages >= 2, definicao.term);
    assert.ok(
      definicao.dependents.length >= 2 || definicao.conceptId,
      "ou o mercado define o termo, ou o restante depende dele",
    );
    assert.ok(contexto13.retrievabilityRequirements.some(item => item.kind === "DEFINITION_BEFORE_DEPTH" && item.subject === definicao.term));
  }

  /* Nenhum glossário: termos sem dependentes e sem definição observada ficam fora. */
  const termos = contexto13.definitionRequirements.map(item => item.term.toLowerCase());
  assert.equal(termos.includes("niacinamida"), false);

  /*
   * O ASSUNTO SÓ É DEFINIDO PORQUE O MERCADO O DEFINE.
   *
   * Todo conceito da amostra depende do assunto do artigo — é do que ele
   * trata. Ler isso como necessidade de definição produziria "defina pele
   * oleosa" com todos os conceitos listados como dependentes: uma obviedade
   * com aparência de requisito. Aqui a exigência existe porque oito páginas
   * abrem uma seção definindo o termo, e a base diz isso.
   */
  const doAssunto = contexto13.definitionRequirements.find(item => /oleos|pele/.test(item.term));
  assert.equal(doAssunto?.basis, "OBSERVED");
  assert.ok(doAssunto?.conceptId, "sustentada por um conceito de definição da amostra");
  assert.equal(
    contexto13.conceptRelations.some(item => item.kind === "REQUIRES" && /oleos|pele/.test(item.object)),
    false,
    "e \"tudo depende do assunto\" não vira relação",
  );

  /* A leitura semântica nasce do `headingOutline`; tirar só de `h2` não tiraria nada. */
  const semDefinicao = descoberta({
    pages: PAGINAS.map(page => ({
      ...page,
      h2: page.h2.filter(texto => !/^O que é/.test(texto)),
      headingOutline: page.headingOutline.filter(item => !/^O que é/.test(item.text)),
    })),
  });
  assert.equal(
    semDefinicao.definitionRequirements.some(item => /oleos|pele/.test(item.term)),
    false,
    "sem o mercado definindo, o assunto não gera exigência de definição",
  );

  /* A cobertura conceitual continua no vocabulário do Gate 9, sem contagem de palavra. */
  assert.ok(contexto13.conceptCoverage.core.length > 0);
  for (const grupo of [contexto13.conceptCoverage.core, contexto13.conceptCoverage.supporting]) {
    for (const item of grupo) assert.ok(item.evidence.length > 10, item.label);
  }
});
