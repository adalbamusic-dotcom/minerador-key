import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarSpecialistSummary, radarSpecialistCell } from "../lib/radar/operational-view.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import { freezeRadarEvidenceBundle, radarFinalizationReadiness } from "../lib/radar/investigation-finalization.ts";
import type { RadarCompetitiveObservedModel } from "../lib/radar/competitive-observed-model.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";

/*
 * ======  GATE 18.7 · A PLANILHA E O CARD, UMA PROJEÇÃO SÓ  =============
 *
 * A investigação real foi finalizada e congelada (bundle:75bd4fc2). Depois do
 * F5, a MESMA TELA dizia três coisas e discordava de si mesma:
 *
 *   Frozen bundle ............. Especialista: 1 ponto
 *   Fontes e autoridade ....... Especialista: 1 ponto preparado
 *   PLANILHA .................. Especialista: "Não necessário"
 *
 * Nenhuma das três mentia sobre o próprio dado. A planilha lia
 * `radarR4SpecialistStatusLabel(localState.specialist)` — o estado do FLUXO R4,
 * que nasce `NOT_REQUIRED` e só muda quando alguém aciona o especialista. Ou
 * seja: ela respondia "ninguém pediu nada" a uma pergunta sobre "a investigação
 * concluiu que precisa de revisão?".
 *
 * É o mesmo defeito do Gate 18.2 numa segunda superfície — e o Gate 18.6
 * mostrou por que corrigir superfície por superfície não fecha nada: enquanto a
 * decisão for montada em dois lugares, os dois voltam a divergir. Aqui ela
 * passa a ser montada UMA vez, por quem tem a investigação em mãos, e viaja no
 * modelo até as duas telas.
 *
 * Nada é executado: fixture em memória, sentinela de rede no fim.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ============================ a fixture ============================== */

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

/*
 * A AFIRMAÇÃO YMYL É O QUE CRIA O REQUISITO.
 *
 * "É seguro usar ácido salicílico na gravidez?" aparece em 7 das 12 páginas: é
 * uma afirmação sensível recorrente na amostra, e é dela que a autoridade de
 * evidência conclui que existe um ponto de revisão profissional. Sem isso a
 * fixture provaria "Não necessário" e nada mais.
 */
const PAGINAS = Array.from({ length: 12 }, (_, index) => {
  const headings = ["Como identificar a pele oleosa?"];
  if (index < 9) headings.push("Por que a pele fica oleosa?");
  if (index < 8) headings.push("Rotina de cuidados para pele oleosa");
  if (index < 7) headings.push("É seguro usar ácido salicílico na gravidez?");
  return pagina(`A${index}`, headings);
});

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v18", articleDnaContentHash: "hash-dna",
    promise: "Explicar como identificar, compreender e cuidar da pele oleosa.",
    mainIntent: "Informacional", hierarchy: "Suporte",
    classification: { intent: "INFORMATIONAL", intentLabel: "Informacional", funnel: "TOP", funnelLabel: "Topo", reason: "A Principal declara este estágio." },
  },
  keywords: [{
    identity: { keywordId: "kw1", canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: "kdna-1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, resultCount: 4200, kgrScore: 0.589, incrementalVolume: null, contribution: null, normalizedIntent: "informational", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", contentHash: "h", intent: "informacional", funnel: "TOFU", semanticState: "conclusive", collectedAt: "2026-09-01T10:00:00.000Z" } },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: "kdna-1", keywordDnaContentHash: "hash-kdna" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null,
  internalLinks: {
    graphId: "graph-1", graphVersionId: "graph-v18", graphContentHash: `sha256:${"c".repeat(64)}`,
    edges: [
      { sourceNodeId: "article:este", targetNodeId: "article:pilar", relationType: "SUPPORT_TO_PILLAR", anchorConcepts: ["rotina de cuidados para pele oleosa"], reason: "O suporte devolve ao Pilar", priority: "HIGH", direction: "outbound" },
      { sourceNodeId: "article:pilar", targetNodeId: "article:este", relationType: "PILLAR_TO_SUPPORT", anchorConcepts: ["pele oleosa e acne"], reason: "O Pilar abre a verticalização", priority: "HIGH", direction: "inbound" },
    ],
  },
  limitations: [],
} as unknown as RadarArticleResearchContext);

const SNAPSHOT = { query: "skincare para pele oleosa", organicResults: PAGINAS.map((page, index) => ({ position: index + 1, title: page.title, domain: `d${index}.com`, url: page.url })) };
const registro = () => startRadarDeepResearch({ context: contexto(), plan: buildRadarResearchQueryPlan(contexto()), startedBy: "ator", now: "2026-09-10T09:00:00.000Z" });

function vista() {
  const base = {
    context: contexto(), record: registro(), snapshot: SNAPSHOT as never, extractions: PAGINAS,
    observedAt: "2026-09-10T12:00:00.000Z",
    diagnostic: { dominantIntent: "informacional", dominantFormats: ["article"] },
  } as Parameters<typeof buildRadarDeepResearchView>[0];

  const universo = buildRadarDeepResearchView(base);
  const recordBase = base.record as NonNullable<typeof base.record>;
  return buildRadarDeepResearchView({
    ...base,
    record: {
      ...recordBase,
      researchCuration: {
        universeFingerprint: radarResearchUniverseFingerprint(universo.references),
        confirmedAt: "2026-09-10T09:30:00.000Z", confirmedBy: "ator",
        references: universo.references.map(reference => ({
          referenceId: reference.referenceId, normalizedUrl: reference.normalizedUrl, url: reference.url,
          decision: autoDecideRadarReference(reference).decision, reason: "",
        })),
      },
    },
  });
}

/** Uma fotografia sem nenhuma afirmação que exija revisão profissional. */
const semRequisitos = (observed: RadarCompetitiveObservedModel) => ({
  ...observed,
  authorityEvidence: { ...observed.authorityEvidence, specialistReviewRequirements: [] },
}) as RadarCompetitiveObservedModel;

/* ============  A FIXTURE PRECISA TER O QUE O GATE INVESTIGA  ========= */

test("GATE 18.7 · a fixture reproduz o estado real: 1 requisito, 0 contribuições", () => {
  const view = vista();
  assert.equal(
    view.observed.authorityEvidence.specialistReviewRequirements.length, 1,
    "sem requisito preparado, todo o resto deste gate seria vacuoso",
  );
});

/* ============  A · 1 REQUISITO + 0 CONTRIBUIÇÃO  ===================== */

test("GATE 18.7 · A — com requisito preparado, nada pode dizer 'Não necessário'", () => {
  const view = vista();

  /*
   * FALSE_NOT_REQUIRED = NO.
   *
   * Zero pedidos e zero contribuições é o estado NORMAL de toda investigação
   * recém-finalizada: é onde ela fica antes de alguém acionar o profissional.
   * Concluir "não necessário" a partir disso apaga a diferença entre não
   * precisar e não ter pedido — que é a distinção inteira desta coluna.
   */
  const resumo = buildRadarSpecialistSummary({ observed: view.observed, specialist: null });

  assert.equal(resumo.requirementsPrepared, 1);
  assert.equal(resumo.requestsSent, 0);
  assert.equal(resumo.contributionsReceived, 0);
  assert.notEqual(resumo.statusLabel, "Não necessário", "FALSE_NOT_REQUIRED");
  assert.match(resumo.statusLabel, /Revisão necessária: 1/);
  assert.equal(resumo.tone, "pending");

  /* E a linha operacional fica separada, sem virar a conclusão. */
  assert.equal(resumo.operationalLine, "0 pedido(s) · 0 contribuição(ões)");
  assert.doesNotMatch(resumo.operationalLine, /necessári/i);
  assert.deepEqual(resumo.lines, ["1 ponto(s) para revisão", "0 pedido(s) · 0 contribuição(ões)"]);

  /* O mesmo vale com pedido enviado e nada recebido. */
  const enviado = buildRadarSpecialistSummary({ observed: view.observed, specialist: { requestsSent: 1 } });
  assert.notEqual(enviado.statusLabel, "Não necessário");
  assert.equal(enviado.operationalLine, "1 pedido(s) · 0 contribuição(ões)");

  /*
   * E A CÉLULA DA PLANILHA, EXECUTADA — não inspecionada.
   *
   * `status: "Não necessário"` abaixo é exatamente o que o fluxo R4 entrega
   * hoje na investigação real: ninguém foi acionado. A célula tem esse valor em
   * mãos e não pode escolhê-lo, porque a investigação concluiu o contrário.
   */
  const celula = radarSpecialistCell({
    status: "Não necessário", contributionsReceived: 0, pending: 0, summary: resumo,
  });
  assert.notEqual(celula.title, "Não necessário", "FALSE_NOT_REQUIRED na linha da planilha");
  assert.equal(celula.title, "Revisão necessária: 1");
  assert.equal(celula.subtitle, "0 pedido(s) · 0 contribuição(ões)");
});

/* ============  B · CARD E PLANILHA, A MESMA PROJEÇÃO  =============== */

test("GATE 18.7 · B — card e planilha consomem o MESMO objeto, não a mesma função", () => {
  /*
   * DUAS CHAMADAS DA MESMA FUNÇÃO NÃO SÃO A MESMA PROJEÇÃO.
   *
   * Era literalmente esse o estado antes deste gate: o card chamava
   * `buildRadarSpecialistSummary` e a planilha lia `specialist.status`, montado
   * cem linhas acima a partir do fluxo R4. Exigir que as duas "usem a
   * autoridade" deixaria o defeito passar de novo se alguém lhes desse
   * entradas diferentes. O que se exige aqui é o mesmo OBJETO.
   */
  const pagina = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const workbench = readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");

  /* A montagem é uma, e acontece onde a investigação existe. */
  assert.equal((pagina.match(/buildRadarSpecialistSummary\(/g) || []).length, 1, "há exatamente uma montagem");
  assert.match(pagina, /const especialista = buildRadarSpecialistSummary\(\{\s*\r?\n\s*observed: deepResearch\.observed,\s*\r?\n\s*finalized: deepResearch\.finalizedBundle,/);
  assert.match(pagina, /specialist: \{ \.\.\.r3\.specialist, summary: especialista, status: especialista\.statusLabel \}/);

  /* O card consome, não monta. */
  assert.match(workbench, /const resumoEspecialista = model\.specialist\.summary/);
  assert.ok(!/buildRadarSpecialistSummary\(/.test(workbench), "o card não monta a própria leitura");

  /* A planilha consome o mesmo campo — e não o estado do fluxo. */
  const coluna = pagina.slice(pagina.indexOf(`{ id: "specialist", header: "Especialista"`), pagina.indexOf(`{ id: "report", header: "Relatório"`));
  assert.ok(coluna.length > 60, "a coluna foi localizada");
  assert.match(coluna, /value: row => radarSpecialistCell\(rowWorkbenchData\(row\)\.r3\.specialist\)\.title/, "até a ordenação usa a mesma célula");
  assert.match(coluna, /const celula = radarSpecialistCell\(rowWorkbenchData\(row\)\.r3\.specialist\)/);
  assert.match(coluna, /\{celula\.title\}/);
  assert.match(coluna, /\{celula\.subtitle\}/);

  /*
   * E NENHUMA DAS INFERÊNCIAS PROIBIDAS sobrou na coluna: contribuições
   * recebidas, especialista escolhido, Telegram ou estado legado.
   */
  for (const proibido of ["radarR4SpecialistStatusLabel", "data.expert", "localState.specialist", "Telegram", "expertSummary", "specialist.status"]) {
    assert.ok(!coluna.includes(proibido), `a coluna ainda infere de "${proibido}"`);
  }

  /*
   * A CÉLULA E O CARD, LADO A LADO — a mesma entrada, a mesma saída.
   *
   * SAME_PROJECTION não é "as duas chamam a mesma função": é as duas lerem o
   * mesmo objeto. O card mostra `summary.statusLabel`; a célula devolve
   * `summary.statusLabel`. Não há como uma mudar sem a outra.
   */
  const view = vista();
  const projecao = buildRadarSpecialistSummary({ observed: view.observed, specialist: null });
  const celula = radarSpecialistCell({ status: "Não necessário", contributionsReceived: 0, pending: 0, summary: projecao });
  assert.equal(celula.title, projecao.statusLabel, "SAME_PROJECTION");
  assert.equal(celula.subtitle, projecao.operationalLine);
  assert.match(workbench, /status: resumoEspecialista\.statusLabel/, "e o card mostra o mesmo rótulo");

  /* Sem projeção, a célula devolve o fluxo — e diz que é o fluxo. */
  const semInvestigacao = radarSpecialistCell({ status: "Opcional · aguardando seleção", contributionsReceived: 0, pending: 0, summary: null });
  assert.equal(semInvestigacao.title, "Opcional · aguardando seleção");
});

/* ============  C · ZERO REQUISITOS  ================================= */

test("GATE 18.7 · C — sem requisito, 'Não necessário' continua sendo a resposta certa", () => {
  /*
   * A CORREÇÃO NÃO PODE TRANSFORMAR TUDO EM PENDÊNCIA.
   *
   * Se nenhuma afirmação da amostra exige revisão profissional, dizer que ela
   * é necessária seria inventar trabalho — o erro simétrico ao do smoke.
   */
  const view = vista();
  const resumo = buildRadarSpecialistSummary({ observed: semRequisitos(view.observed), specialist: null });

  assert.equal(resumo.requirementsPrepared, 0);
  assert.equal(resumo.statusLabel, "Não necessário");
  assert.equal(resumo.tone, "neutral");
  assert.deepEqual(resumo.lines, ["Nenhuma afirmação exige revisão profissional"]);

  /* E o ciclo continua andando quando alguém age, mesmo sem requisito. */
  assert.equal(buildRadarSpecialistSummary({ observed: semRequisitos(view.observed), specialist: { contributionsReceived: 1 } }).statusLabel, "Contribuição recebida");
});

/* ============  D · O F5 SOBRE A INVESTIGAÇÃO CONGELADA  ============= */

test("GATE 18.7 · D — o bundle congelado responde pela linha depois do F5", () => {
  const view = vista();
  const congelamento = freezeRadarEvidenceBundle({
    readiness: radarFinalizationReadiness({
      started: true, stale: false, alreadyFinalized: false,
      pending: 0, analyzed: view.observed.sample.analyzedSuccess,
      failed: view.observed.sample.failedFinal, sufficiency: view.sufficiency,
    }),
    observed: view.observed, record: registro(), mode: "WEB", sufficiency: view.sufficiency,
    blueprint: view.blueprint, frozenBy: "ator", frozenAt: "2026-09-10T13:00:00.000Z",
  });
  assert.equal(congelamento.ok, true);
  if (!congelamento.ok) return;

  const bundle = congelamento.bundle;
  assert.equal(bundle.authority.specialistRequirements.length, 1, "o bundle congelou o ponto de revisão");

  /* Com o bundle, a leitura é a dele — e bate com o que a tela do bundle mostra. */
  const comBundle = buildRadarSpecialistSummary({ observed: view.observed, finalized: bundle, specialist: null });
  assert.equal(comBundle.requirementsPrepared, bundle.authority.specialistRequirements.length);
  assert.equal(comBundle.requirementsSource, "FROZEN_BUNDLE");
  assert.notEqual(comBundle.statusLabel, "Não necessário");

  /*
   * E O CONGELADO PREVALECE SOBRE A LEITURA VIVA.
   *
   * O F5 remonta `observed` do snapshot a cada carga; o bundle é o registro do
   * que foi finalizado. Se um dia as duas divergirem, quem responde pela
   * investigação encerrada é o bundle — senão a linha mudaria sozinha depois de
   * finalizada, que é o oposto de congelar.
   */
  const vivaZerada = buildRadarSpecialistSummary({ observed: semRequisitos(view.observed), finalized: bundle, specialist: null });
  assert.equal(vivaZerada.requirementsPrepared, 1, "o congelado prevalece");
  assert.notEqual(vivaZerada.statusLabel, "Não necessário");

  /* Sem bundle, a fonte volta a ser a leitura viva — declarada, não implícita. */
  assert.equal(buildRadarSpecialistSummary({ observed: view.observed, specialist: null }).requirementsSource, "OBSERVED_AUTHORITY");

  /* FROZEN_BUNDLE_MUTATED = NO: a leitura não escreve no que foi congelado. */
  const antes = JSON.stringify(bundle);
  buildRadarSpecialistSummary({ observed: view.observed, finalized: bundle, specialist: { requestsSent: 3 } });
  assert.equal(JSON.stringify(bundle), antes, "o bundle não é tocado pela leitura");
});

/* ============  A INVESTIGAÇÃO NÃO É MUTADA  ========================= */

test("GATE 18.7 · a projeção é leitura pura e não alcança a investigação", () => {
  const view = vista();
  const antes = JSON.stringify(view.observed.authorityEvidence.specialistReviewRequirements);

  buildRadarSpecialistSummary({ observed: view.observed, specialist: { requestsSent: 2, contributionsReceived: 1, reviewedEvidence: 1 } });
  assert.equal(JSON.stringify(view.observed.authorityEvidence.specialistReviewRequirements), antes);

  const modulo = readFileSync(new URL("../lib/radar/operational-view.ts", import.meta.url), "utf8");
  const inicio = modulo.indexOf("export function buildRadarSpecialistSummary");
  assert.ok(inicio > 0, "a função foi localizada");
  /* Só o corpo DELA: o resto do módulo tem outras projeções, com outras regras. */
  const seguinte = modulo.indexOf("\nexport ", inicio + 1);
  const corpo = modulo.slice(inicio, seguinte > 0 ? seguinte : undefined);
  assert.ok(corpo.includes("requirementsSource") && corpo.length < 4000, "o recorte é a função, não o módulo");
  const codigo = corpo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of ["fetch", "await ", "supabase", ".push("]) {
    assert.ok(!codigo.includes(proibido), `a projeção não faz "${proibido}"`);
  }
});

/* ============  E · ZERO PROVIDER  =================================== */

test("GATE 18.7 · E — nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `REAL_PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});
