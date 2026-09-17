import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { googleCompetitiveBlueprintOfAnalysis } from "../lib/radar/google-editorial.ts";
import { radarCompetitiveBlueprintViewOfAnalysis } from "../lib/radar/competitive-blueprint-view.ts";
import {
  RadarAuthorityNeedSchema,
  RadarCompetitiveBlueprintSchema,
  RadarRecommendationSchema,
  RadarSectionDirectionSchema,
  assertRadarBlueprintSeparation,
} from "../lib/radar/competitive-blueprint.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { RADAR_INVESTIGATION_STAGES } from "../lib/radar/investigation-state.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";

/*
 * ===== RADAR_BLUEPRINT_CANONICAL_1.1 · O ADAPTER DO GOOGLE =====
 *
 * O gate 1 deixou o Google fora do envelope: ele mantinha a autoridade do
 * pipeline dele e a leitura editorial não existia. Isso deixava a promessa
 * pela metade — Google e YouTube falavam línguas diferentes sobre a mesma
 * pergunta ("o que eu escrevo?").
 *
 * Este gate traduz. NÃO substitui: o pipeline continua com as seis etapas.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ================ a bancada: uma investigação Google real ================ */

/*
 * A BANCADA É A MESMA DAS SUÍTES DO GOOGLE — de propósito.
 *
 * Inventar uma forma de página aqui testaria a minha fantasia do contrato de
 * extração, não o adapter.
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

const contexto = (): RadarArticleResearchContext => ({
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

const vista = () => buildRadarDeepResearchView({
  context: contexto(),
  snapshot: { query: "skincare para pele oleosa", organicResults: PAGINAS.map((item, indice) => ({ position: indice + 1, title: item.title, domain: `d${indice}.com`, url: item.url })) } as never,
  extractions: PAGINAS,
  selectedReferences: PAGINAS.length,
  observedAt: "2026-09-10T12:00:00.000Z",
});

const adaptar = (frozenAt: string | null = null) => googleCompetitiveBlueprintOfAnalysis({
  articleId: "a1", articleDnaVersionId: "d1",
  observed: vista().observed,
  researchRefs: [{ source: "WEB_SERP", role: "PRIMARY_COMPETITIVE_RESEARCH", ref: "serp-9", fingerprint: null, collectedAt: null, sampleSize: PAGINAS.length }],
  generatedAt: "2026-09-14T20:00:00.000Z",
  frozenAt,
});

/* ============ A · o workflow do Google continua intacto ============ */

test("A · o pipeline do Google continua com as seis etapas canônicas", () => {
  /*
   * A trava mais importante deste gate. Um adapter que reduzisse o pipeline aos
   * seis estados do perfil perderia curadoria, modelo e revisão pelo caminho —
   * seis caixas onde havia seis etapas com nome próprio.
   */
  assert.deepEqual([...RADAR_INVESTIGATION_STAGES], [
    "SERP_COLLECTION", "SERP_CURATION", "COMPETITIVE_ANALYSIS",
    "COMPETITIVE_MODEL", "COMPETITIVE_REPORT", "FINAL_REVIEW",
  ]);

  const antes = vista();
  adaptar();
  const depois = vista();
  /* C · o adapter é função pura: ler não muda estado. */
  assert.equal(depois.state, antes.state);
  assert.deepEqual(depois.phase1, antes.phase1);
  /* E a vista inteira permanece idêntica: traduzir não é intervir. */
  assert.deepEqual(JSON.parse(JSON.stringify(depois)), JSON.parse(JSON.stringify(antes)));
});

test("C · o adapter não importa nada que mude estado ou persista", async () => {
  const fonte = semComentarios(await readFile(new URL("../lib/radar/google-editorial.ts", import.meta.url), "utf8"));
  assert.equal(/fetch\(|from ["']\.\.\/server\//.test(fonte), false, "domínio puro");
  assert.equal(/investigation-state|operational-actions|phase1|saveRadar|appendRadar/.test(fonte), false, "não toca o pipeline");
});

/* ============ B · o Google usa o envelope canônico ============ */

test("B · o Google entra no CompetitiveBlueprintEnvelope, discriminado", () => {
  const bp = adaptar();
  assert.equal(bp.profile, "GOOGLE");
  assert.equal(bp.schemaVersion, 1);
  /* O schema aceita de volta o que o adapter produziu. */
  assert.doesNotThrow(() => RadarCompetitiveBlueprintSchema.parse(bp));
  assert.ok(bp.researchRefs.length, "§3 · referências, nunca matéria-prima");
});

test("B · os campos do §2 chegam preenchidos a partir do que o Google já observou", () => {
  const bp = adaptar();
  assert.equal(bp.profile, "GOOGLE");

  assert.ok(bp.observed.comparablePages > 0);
  assert.ok(bp.observed.intent.length, "intenção");
  assert.ok(bp.observed.recurringPatterns.length, "padrões estruturais");
  assert.ok(bp.observed.questions.length, "perguntas");
  assert.ok(bp.observed.sufficiency);

  assert.ok(bp.recommended.intentToSatisfy);
  assert.ok(bp.recommended.editorialAngle.sourceSignal);
  assert.ok(bp.recommended.sectionDirections.length, "a sequência de seções");
  /*
   * §10 · A SAÍDA EDITORIAL SÓ SOBE COM EVIDÊNCIA.
   *
   * Esta amostra não tem sinal audiovisual: prometer pacote multiformato aqui
   * daria ao Planejador trabalho que a investigação não justifica.
   */
  assert.equal(bp.recommended.editorialOutput, "ARTICLE", "sem sinal de vídeo, é artigo");
  assert.notEqual(bp.recommended.editorialOutput, "MULTIFORMAT_PACKAGE");
});

test("§6 · observed e recommended continuam separados no Google", () => {
  const bp = adaptar();
  assertRadarBlueprintSeparation(bp);

  /*
   * TODA observação carrega o que a sustenta, com número — não só os padrões.
   *
   * Evidência sem contagem é frase; com "9 de 12 páginas", vira dado que dá
   * para conferir e contestar.
   */
  const arrays = Object.entries(bp.observed).filter(([, valor]) => Array.isArray(valor));
  assert.ok(arrays.length >= 8, "o observed do Google tem várias famílias de sinal");
  let comContagem = 0;
  for (const [campo, sinais] of arrays) {
    for (const sinal of sinais as Array<{ grade: string; evidence: string; id: string; count: number | null }>) {
      assert.notEqual(sinal.grade, "DERIVED", `${campo}/${sinal.id} é conclusão nossa dentro de observed`);
      assert.ok(sinal.evidence.length > 10, `${campo}/${sinal.id} sem evidência`);

      /*
       * NÚMERO ONDE HÁ CONTAGEM — e prosa onde a contagem não existe.
       *
       * O sinal de intenção divergente diz "não houve evidência suficiente para
       * confrontar". Exigir um número ali me obrigaria a fabricar um; o que ele
       * declara é ausência, e ausência declarada é dado.
       */
      if (sinal.count !== null) {
        comContagem += 1;
        assert.match(sinal.evidence, /\d/, `${campo}/${sinal.id} tem contagem e evidência sem número: "${sinal.evidence}"`);
      }
    }
  }
  assert.ok(comContagem >= 10, "a maior parte dos sinais é contável, e mostra a conta");
  /* E toda recomendação aponta para a origem. */
  assert.equal(bp.profile, "GOOGLE");
  for (const item of [bp.recommended.editorialAngle, ...bp.recommended.differentiation, ...bp.recommended.questionCoverage]) {
    assert.ok(item.sourceSignal.length > 5, `recomendação sem origem: ${item.id}`);
  }

  /*
   * E o CONTRATO recusa o vazio, não só o construtor. Um `default("")` deixaria
   * outro produtor entregar palpite com a mesma aparência de leitura.
   */
  assert.throws(() => RadarRecommendationSchema.parse({ id: "x", statement: "Faça X", objective: "para Y", sourceSignal: "" }));
  assert.throws(() => RadarSectionDirectionSchema.parse({ order: 1, headingDirection: "h", objective: "o", sourceSignal: "" }));
  assert.throws(() => RadarAuthorityNeedSchema.parse({ claim: "c", evidenceType: "e", sourceTypeNeeded: "s", sourceSignal: "" }));
});

/* ============ §7 · a estrutura é utilizável, e não copiada ============ */

test("§7 · as seções dizem o que resolvem — e nenhum heading concorrente é copiado", () => {
  const bp = adaptar();
  assert.equal(bp.profile, "GOOGLE");

  assert.ok(bp.recommended.sectionDirections.length > 0);
  for (const secao of bp.recommended.sectionDirections) {
    assert.ok(secao.objective.length > 10, `seção ${secao.order} sem objetivo`);
    assert.ok(secao.sourceSignal.length > 10, `seção ${secao.order} sem origem`);
    assert.ok(secao.headingDirection.length > 20, "a direção é direção, não rótulo");
  }

  /*
   * ============ A LINHA QUE O §7 DE FATO TRAÇA ============
   *
   * Nesta amostra a pergunta canônica É, literalmente, o H2 de 12 de 12
   * concorrentes: "Como identificar a pele oleosa?". Proibir a string inteira
   * tornaria o blueprint inútil — a pergunta que o mercado responde é
   * observação legítima, e o artigo precisa fechá-la.
   *
   * O que o §7 proíbe é entregar o HEADING alheio como recomendação de
   * heading. Então a regra é de LUGAR: a pergunta vive em `answersQuestion`,
   * declarada como observação; a direção do heading manda formular do próprio
   * jeito e não reproduz nada da amostra.
   */
  const headings = PAGINAS.flatMap(pagina => [...pagina.h1, ...pagina.h2, ...pagina.h3, pagina.title]);

  for (const secao of bp.recommended.sectionDirections) {
    for (const heading of headings) {
      assert.equal(secao.headingDirection.includes(heading), false, `heading copiado na direção: ${heading}`);
    }
  }

  /* E a pergunta observada está onde deve, declarada como tal. */
  const comPergunta = bp.recommended.sectionDirections.filter(item => item.answersQuestion);
  assert.ok(comPergunta.length > 0, "as seções dizem qual pergunta fecham");
  for (const secao of comPergunta) {
    assert.ok(bp.observed.questions.some(item => item.statement === secao.answersQuestion), "a pergunta veio do observado");
  }

  /* Título de concorrente não entra em lugar nenhum da recomendação. */
  const recomendado = JSON.stringify(bp.recommended);
  for (const pagina of PAGINAS) {
    assert.equal(recomendado.includes(pagina.title), false, `título copiado: ${pagina.title}`);
    assert.equal(recomendado.includes(pagina.url), false, `url copiada: ${pagina.url}`);
  }
});

/* ============ §8 · autoridade como instrução ============ */

test("§8 · o domínio citado fica em OBSERVADO; a recomendação fala em TIPO de fonte", () => {
  const bp = adaptar();
  assert.equal(bp.profile, "GOOGLE");

  /*
   * "Quatro concorrentes citam a mesma instituição" descreve o mercado. Virar
   * isso em "cite esta instituição" seria endosso editorial de uma fonte que o
   * Radar nunca avaliou.
   */
  const plano = JSON.stringify(bp.recommended.authorityPlan);
  for (const pagina of PAGINAS) {
    const dominio = new URL(pagina.url).hostname;
    assert.equal(plano.includes(dominio), false, `domínio do concorrente recomendado: ${dominio}`);
  }

  /*
   * E o domínio que os concorrentes CITAM é o caso perigoso de verdade.
   *
   * "Quatro páginas citam a American Academy of Dermatology" é observação de
   * mercado. Virar isso em "cite a AAD" seria endossar uma fonte que o Radar
   * nunca avaliou — e o endosso viajaria até o Redator como se fosse critério.
   */
  const citado = link().destinationDomain;
  assert.equal(plano.includes(citado), false, `fonte citada virou recomendação: ${citado}`);
  assert.equal(plano.includes(link().anchorText!), false, "a âncora do concorrente virou recomendação");

  for (const item of bp.recommended.authorityPlan) {
    assert.ok(item.evidenceType.length > 10);
    assert.ok(item.sourceTypeNeeded.length > 10, "tipo de fonte, não endereço");
    assert.ok(item.sourceSignal.length > 5);
  }
});

/* ====== os ramos que esta amostra não alcança, exercitados ====== */

/**
 * A AMOSTRA REAL NÃO PRODUZ YMYL, DIFERENCIAL NEM LINK DE SAÍDA.
 *
 * "Skincare para pele oleosa" com 12 páginas equivalentes não dispara nenhum
 * dos três. Sem isto, três ramos do adapter ficariam sem prova — e um deles é
 * o do §8, onde o erro custa caro: recomendar a fonte que o concorrente citou.
 *
 * O modelo base é REAL; só as linhas que esses ramos consomem são acrescentadas.
 */
const modeloComTudo = () => {
  const base = vista().observed;
  return {
    ...base,
    differentiations: [{
      subject: "protocolo testado em oito semanas",
      basis: "ARTICLE_DECLARES" as const,
      pagesCovering: 1, sampleSize: 12,
      sources: [{ pageId: "page:A0", url: PAGINAS[0].url, title: PAGINAS[0].title }],
      evidence: "1 de 12 página(s) comparável(is) tratam o assunto.",
    }],
    authorityEvidence: {
      ...base.authorityEvidence,
      claims: base.authorityEvidence.claims.map((claim, indice) => indice === 0
        ? { ...claim, ymyl: { ...claim.ymyl, relevance: "HIGH" as const } }
        : claim),
      specialistReviewRequirements: [{
        requirementId: "req-1",
        claimId: base.authorityEvidence.claims[0]!.claimId,
        topic: "oleosidade",
        claim: base.authorityEvidence.claims[0]!.canonicalClaim,
        kind: "RESOLVE_FACTUAL_UNCERTAINTY" as const,
        whyReviewIsNeeded: "A afirmação toca conduta de saúde e a amostra não traz evidência primária.",
        ymylRelevance: "HIGH" as const,
        marketObservation: "9 de 12 páginas repetem a afirmação.",
        factualEvidence: "Sem evidência primária localizada.",
        conflict: null,
      }],
    },
    internalLinkPlan: {
      ...base.internalLinkPlan,
      outgoing: [{
        nodeId: "node-7", slug: "acido-salicilico", targetRole: "SUPORTE",
        direction: "OUTGOING", relationTypes: ["SUPPORTS"],
        approvedAnchorConcepts: ["ácido salicílico"],
        structuralRequirement: "REQUIRED", applicationStatus: "RESOLVED",
        recommendedOccurrences: 1,
        occurrencesReason: "1 contexto distinto sustentado por 6 de 12 página(s).",
        supportingContexts: [{
          order: 1, conceptId: "c-1", conceptLabel: "ácido salicílico", conceptType: "INGREDIENT",
          pages: 6, sampleSize: 12, queryCoverage: 1, confidence: "HIGH",
          sections: ["Rotina de cuidados para pele oleosa"],
          evidence: "6 de 12 página(s) tratam o conceito nesta seção.",
        }],
        rejectedContexts: [],
      }],
    },
  };
};

const adaptarCompleto = () => googleCompetitiveBlueprintOfAnalysis({
  articleId: "a1", articleDnaVersionId: "d1",
  observed: modeloComTudo() as never,
  researchRefs: [],
  generatedAt: "2026-09-14T20:00:00.000Z",
});

test("§8 · a fonte que o concorrente CITA nunca vira recomendação", () => {
  const bp = adaptarCompleto();
  assert.equal(bp.profile, "GOOGLE");
  assert.ok(bp.recommended.authorityPlan.length > 0, "o ramo YMYL foi exercitado");

  /*
   * ESTE É O ERRO QUE CUSTA CARO.
   *
   * "Quatro páginas citam a American Academy of Dermatology" é observação de
   * mercado. Virar isso em "cite a AAD" endossaria uma fonte que o Radar nunca
   * avaliou — e o endosso viajaria até o Redator como se fosse critério.
   */
  const plano = JSON.stringify(bp.recommended.authorityPlan);
  assert.equal(plano.includes("aad.org"), false, "domínio citado virou recomendação");
  assert.equal(plano.includes("American Academy"), false, "a âncora do concorrente virou recomendação");

  for (const item of bp.recommended.authorityPlan) {
    assert.ok(item.sourceTypeNeeded.length > 10, "tipo de fonte, não endereço");
    assert.equal(/https?:|\.com|\.org|\.br/.test(item.sourceTypeNeeded), false, `endereço na recomendação: ${item.sourceTypeNeeded}`);
    assert.ok(item.sourceSignal.length > 5, "e a origem da instrução");
  }
  assert.ok(bp.recommended.authorityPlan.some(item => item.specialistReason), "o especialista chega com o porquê");
  assert.ok(bp.recommended.authorityPlan.some(item => item.ymylRelevant), "e o YMYL é marcado");
});

test("§6 · diferencial e link de saída também carregam origem", () => {
  const bp = adaptarCompleto();
  assert.equal(bp.profile, "GOOGLE");

  assert.ok(bp.recommended.differentiation.length > 0, "o ramo de diferencial foi exercitado");
  for (const item of bp.recommended.differentiation) {
    assert.ok(item.sourceSignal.length > 5, `diferencial sem origem: ${item.id}`);
    assert.ok(item.objective.length > 5);
  }

  assert.ok(bp.recommended.internalLinkPlan.length > 0, "o ramo de links foi exercitado");
  for (const link of bp.recommended.internalLinkPlan) {
    assert.ok(link.sourceSignal.length > 5, "o link diz por que aquele número de ocorrências");
    assert.ok(link.placementContext.length > 10);
    /* §9 · a âncora é DIREÇÃO, e o conceito aprovado vem do Arquiteto. */
    assert.match(link.anchorDirection, /reescrita|derivada/);
  }
});

/* ============ §9 · links internos sem recriar o grafo ============ */

test("§9 · o plano de links traduz o que o Arquiteto aprovou, sem redefini-lo", async () => {
  const fonte = semComentarios(await readFile(new URL("../lib/radar/google-editorial.ts", import.meta.url), "utf8"));

  /* Nada de reconstruir grafo ou relação estrutural aqui. */
  assert.equal(/buildInternalLinkGraph|InternalLinkGraphSchema|structuralRequirement:\s*"/.test(fonte), false);
  assert.ok(fonte.includes("observed.internalLinkPlan.outgoing"), "ele LÊ o plano que já existe");

  const bp = adaptar();
  assert.equal(bp.profile, "GOOGLE");
  /* Zero ocorrência é resposta legítima, e chega dita. */
  for (const link of bp.recommended.internalLinkPlan) {
    assert.ok(link.placementContext.length > 10);
    assert.ok(link.occurrences >= 0);
  }
});

/* ============ D · a fotografia do Google vence o vivo ============ */

test("D · havendo fotografia canônica, o blueprint a declara como congelada", () => {
  const comum = {
    profile: "GOOGLE" as const, articleId: "a1", articleDnaVersionId: "d1",
    frozen: null, liveBlueprint: null, liveMultimodal: null,
    primaryKeyword: "skincare para pele oleosa", generatedAt: "2026-09-14T22:00:00.000Z",
    googleObserved: vista().observed,
  };

  const viva = radarCompetitiveBlueprintViewOfAnalysis(comum);
  assert.equal(viva.frozen, false);
  assert.equal(viva.blueprint?.provenance.frozenAt, null);

  const congelada = radarCompetitiveBlueprintViewOfAnalysis({ ...comum, googleFrozenAt: "2026-09-14T21:00:00.000Z" });
  assert.equal(congelada.frozen, true);
  assert.equal(congelada.blueprint?.provenance.frozenAt, "2026-09-14T21:00:00.000Z");

  /* E a contagem da amostra sai do modelo, não de recontagem da tela. */
  assert.equal(congelada.sample.label, "página(s)");
  assert.equal(congelada.sample.count, vista().observed.sample.comparablePages);
});

test("D · sem modelo competitivo, a ausência é DITA", () => {
  const vazio = radarCompetitiveBlueprintViewOfAnalysis({
    profile: "GOOGLE", articleId: "a1", articleDnaVersionId: "d1",
    frozen: null, liveBlueprint: null, liveMultimodal: null, googleObserved: null,
    primaryKeyword: null, generatedAt: "2026-09-14T22:00:00.000Z",
  });
  assert.equal(vazio.blueprint, null);
  assert.match(vazio.unavailableReason!, /modelo competitivo/);
});

/* ============ E, F, G, H · a casca visual ============ */

test("E · o Google usa os MESMOS componentes e a mesma casca", async () => {
  const componente = await readFile(new URL("../modules/radar/radar-competitive-blueprint.tsx", import.meta.url), "utf8");

  /* Os quatro cards do §6, com a semântica do perfil. */
  for (const card of ["modelo", "busca", "autoridade", "aplicacao"]) {
    assert.ok(componente.includes(`testid="radar-blueprint-card-${card}"`), `falta o card ${card}`);
  }
  assert.ok(componente.includes('data-testid="radar-blueprint-strategy"'), "e a estratégia editorial");

  /* Os mesmos blocos de observado/recomendado dos dois perfis. */
  assert.ok(componente.includes("function GoogleBlueprint"));
  assert.ok(componente.includes("function YoutubeBlueprint"));
  const google = componente.slice(componente.indexOf("function GoogleBlueprint"), componente.indexOf("/* ============================ a seção inteira"));
  assert.ok(google.includes("<Observado "), "reusa o componente de observação");
  assert.ok(google.includes("<Recomendado "), "e o de recomendação");
  assert.ok(google.includes("<Cartao "), "e a mesma grade de cards");
});

test("E · a UI não monta interpretação fora da autoridade", async () => {
  /*
   * §19 · quatro componentes montando a mesma leitura foi o defeito do 1.1,
   * com um dado mais barato. A UI recebe blueprint pronto — dos DOIS perfis.
   */
  const componente = semComentarios(await readFile(new URL("../modules/radar/radar-competitive-blueprint.tsx", import.meta.url), "utf8"));
  assert.equal(
    /googleCompetitiveBlueprintOfAnalysis|buildRadarYoutubeCanonicalBlueprint|radarCompetitiveBlueprintViewOfAnalysis|direcoesDeSecao|planoDeAutoridade/.test(componente),
    false,
    "a UI não constrói blueprint",
  );
  assert.equal(/deepResearch|analysisVersions|\.observed\.sample\.|payload\?\./.test(componente), false, "nem lê caminho JSON cru");
});

test("E · o conteúdo operacional do Google NÃO foi apagado", async () => {
  const workbench = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");

  /*
   * O gate manda ORGANIZAR, não substituir. Os resumos operacionais continuam
   * abaixo do blueprint — quem opera o pipeline ainda precisa deles.
   */
  assert.ok(workbench.includes('testId="radar-summary-model"'), "o resumo operacional ficou");
  assert.ok(workbench.includes('data-testid="radar-research-summary"'), "e a régua de métricas também");
  assert.ok(workbench.includes("<RadarCompetitiveBlueprintSection view={researchBlueprint}/>"), "com o blueprint acima");

  const fonte = semComentarios(workbench);
  assert.ok(
    fonte.indexOf("RadarCompetitiveBlueprintSection") < fonte.indexOf('testId="radar-summary-model"'),
    "a leitura editorial vem antes do resumo operacional",
  );
});

test("F e G · amostra e proveniência continuam fechadas por padrão", async () => {
  const painel = semComentarios(await readFile(new URL("../modules/radar/radar-youtube-search-panel.tsx", import.meta.url), "utf8"));
  assert.ok(painel.includes('data-testid="radar-youtube-sample-details"'));
  assert.ok(painel.includes('data-testid="radar-youtube-provenance-details"'));
  assert.ok(painel.includes('data-testid="radar-youtube-cohort-details"'));

  /* E no Google, as leituras profundas continuam atrás de disclosure. */
  const workbench = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  assert.ok(workbench.includes(String.raw`<Resumo testId="radar-summary-model"`), "os resumos abrem sob demanda");
});

test("H · nenhum ID técnico no fluxo editorial do Google", async () => {
  const componente = await readFile(new URL("../modules/radar/radar-competitive-blueprint.tsx", import.meta.url), "utf8");

  /*
   * A fatia cobre TODOS os componentes do Google — Secoes, Autoridade, Links e
   * GoogleBlueprint —, não só o último. Um `nodeId` renderizado dentro de
   * Links vazaria pela mesma tela e ficaria fora de uma fatia estreita.
   */
  const google = semComentarios(componente.slice(
    componente.indexOf("/* ======================= o perfil GOOGLE"),
    componente.indexOf("/* ============================ a seção inteira"),
  )).replace(/key=\{[^}]*\}/g, " ");

  assert.ok(google.includes("function Links"), "a fatia cobre os quatro componentes");
  assert.equal(/runId|fingerprint|snapshotId|bundleHash|claimId|nodeId|conceptId|JSON\.stringify/.test(google), false);

  /* E o adapter não despeja id de página na leitura editorial. */
  const bp = adaptar();
  assert.equal(bp.profile, "GOOGLE");
  const editorial = JSON.stringify(bp.recommended);
  for (const pagina of PAGINAS) {
    assert.equal(editorial.includes(pagina.url), false, `url vazou: ${pagina.url}`);
    assert.equal(editorial.includes(pagina.id), false, `id de página vazou: ${pagina.id}`);
  }
});

/* ============ I e J · sem regressão ============ */

test("I · o YouTube continua no envelope, sem tocar na lógica dele", async () => {
  const componente = await readFile(new URL("../modules/radar/radar-competitive-blueprint.tsx", import.meta.url), "utf8");
  for (const card of ["modelo", "titulos", "roteiro", "formatos"]) {
    assert.ok(componente.includes(`testid="radar-blueprint-card-${card}"`), `o card ${card} do YouTube sumiu`);
  }
  assert.ok(componente.includes('data-testid="radar-blueprint-application"'), "e o pacote editorial");

  /* O despacho por perfil escolhe um, e os dois existem. */
  assert.ok(componente.includes('view.blueprint.profile === "YOUTUBE" && <YoutubeBlueprint'));
  assert.ok(componente.includes('view.blueprint.profile === "GOOGLE" && <GoogleBlueprint'));
});

test("J · a união AMAZON continua compilando e usando a mesma casca", () => {
  const amazon = RadarCompetitiveBlueprintSchema.parse({
    schemaVersion: 1, profile: "AMAZON", articleId: "a1", articleDnaVersionId: "d1",
    observed: { products: 0, sufficiency: "Sem coleta." },
    recommended: {},
    provenance: { generatedAt: "2026-09-14T20:00:00.000Z" },
  });
  assert.equal(amazon.profile, "AMAZON");

  const vista = radarCompetitiveBlueprintViewOfAnalysis({
    profile: "AMAZON", articleId: "a1", articleDnaVersionId: "d1",
    frozen: null, liveBlueprint: null, liveMultimodal: null,
    primaryKeyword: null, generatedAt: "2026-09-14T22:00:00.000Z",
  });
  assert.equal(vista.blueprint, null);
  assert.equal(vista.sample.label, "produto(s)");
  /*
   * A FRASE MUDOU EM AMAZON_SEARCH_2 — porque o coletor passou a existir.
   *
   * O que este teste protege é que a AUSÊNCIA seja dita: uma seção vazia não
   * conta se falta coleta, falta análise ou a leitura quebrou. Agora a
   * ausência do perfil Amazon é sobre a coleta, não sobre o coletor.
   */
  assert.match(vista.unavailableReason!, /coleta da Amazon/);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
