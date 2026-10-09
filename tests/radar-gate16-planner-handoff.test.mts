import assert from "node:assert/strict";
import test from "node:test";
// O envelope V3 do Planejador saiu em 2026-10-01; fica a prontidão de entrega do Radar.
import { radarHandoffReadiness } from "../lib/radar/handoff-readiness.ts";
import { buildRadarEvidenceBundle } from "../lib/radar/evidence-bundle.ts";
import { buildRadarSpecialistEvidenceLayer } from "../lib/radar/specialist-evidence.ts";
import { radarSpecialistExtraction } from "../lib/radar/specialist-contribution-review.ts";
import { freezeRadarEvidenceBundle, radarFinalizationReadiness } from "../lib/radar/investigation-finalization.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import { buildRadarReportSummary } from "../lib/radar/operational-view.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";

/*
 * ======  GATE 16 · A FRONTEIRA COM O PLANEJADOR  ========================
 *
 *   ArticleDNA aprovado + RadarEvidenceBundle FINALIZADO → PlannerHandoff
 *
 * O que este arquivo protege é uma coisa só: que nada seja INVENTADO nem
 * PERDIDO na travessia. Um handoff que reinterpreta é pior que um handoff que
 * falta — porque ele chega com aparência de evidência.
 *
 * Transformação e validação determinísticas. REAL_PROVIDER_CALLS = 0, com
 * sentinela no fim.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* =============================== a fixture ============================== */

const link = (): RadarObservedLink => ({
  destinationUrl: "https://www.aad.org/public/diseases/oily-skin",
  destinationDomain: "www.aad.org", kind: "EXTERNAL", anchorText: "American Academy of Dermatology",
  surroundingText: "A produção de sebo é regulada por hormônios.",
  sectionHeading: "Por que a pele fica oleosa?", rel: [], target: null, order: 0,
});

const pagina = (id: string, headings: string[], status: RadarExtractionPage["status"] = "success"): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status,
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
 * A AMOSTRA PRECISA TER O QUE O CONTRATO PROMETE TRANSPORTAR.
 *
 * A primeira versão desta fixture produzia zero links, zero fontes, zero
 * evidência factual e zero requisito de especialista — e metade dos testes
 * abaixo passava percorrendo lista vazia. Verde sem substância é pior que
 * vermelho: ele afirma que a travessia preserva coisas que nunca existiram.
 *
 * A pergunta de segurança é deliberada: ela produz afirmação YMYL de alta
 * relevância, que é o que faz nascer requisito de especialista e o que torna
 * o teste de INSUFFICIENT → SUPPORTED uma prova em vez de uma frase.
 */
const PAGINAS = Array.from({ length: 12 }, (_, index) => {
  const headings = ["Como identificar a pele oleosa?"];
  if (index < 9) headings.push("Por que a pele fica oleosa?");
  if (index < 8) headings.push("Rotina de cuidados para pele oleosa");
  if (index < 7) headings.push("É seguro usar ácido salicílico na gravidez?");
  if (index < 6) headings.push("Riscos do uso diário de esfoliante ácido");
  return pagina(`A${index}`, headings);
});

const ARTIGO = { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v16", articleDnaContentHash: "hash-dna-v16" };

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { ...ARTIGO, promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [{
    identity: { keywordId: "kw1", canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: "kdna-1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, resultCount: 4200, kgrScore: 0.589, incrementalVolume: null, contribution: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", contentHash: "h", intent: "informacional", funnel: "TOFU", semanticState: "conclusive", collectedAt: "2026-09-01T10:00:00.000Z" } },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: "kdna-1", keywordDnaContentHash: "hash-kdna" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null,
  /*
   * O GRAFO APROVADO PELO ARQUITETO — três relações, duas direções.
   *
   * Sem ele, `internalLinkPlan` nasce vazio e os testes de §10, §11 e §35
   * percorrem nada. Com ele existem aplicações reais para atravessar, e pelo
   * menos uma relação exigida que esta rodada não conseguiu posicionar — que é
   * exatamente o caso que o contrato não pode suavizar.
   */
  internalLinks: {
    graphId: "graph-1", graphVersionId: "graph-v16", graphContentHash: `sha256:${"c".repeat(64)}`,
    edges: [
      { sourceNodeId: "article:este", targetNodeId: "article:pilar", relationType: "SUPPORT_TO_PILLAR", anchorConcepts: ["skincare para pele oleosa"], reason: "O suporte devolve ao Pilar", priority: "HIGH", direction: "outbound" },
      { sourceNodeId: "article:este", targetNodeId: "silo-page:skincare", relationType: "ARTICLE_TO_SILO_PAGE", anchorConcepts: ["guia de skincare"], reason: "O suporte devolve à raiz do Silo", priority: "MEDIUM", direction: "outbound" },
      { sourceNodeId: "article:pilar", targetNodeId: "article:este", relationType: "PILLAR_TO_SUPPORT", anchorConcepts: ["pele oleosa e acne"], reason: "O Pilar abre a verticalização", priority: "HIGH", direction: "inbound" },
    ],
  },
  limitations: [],
} as unknown as RadarArticleResearchContext);

/*
 * AS FONTES QUE O ANALYZE VERIFICOU — uma que sustenta, uma que não.
 *
 * Com a lista vazia, `factualEvidence` nasce vazia e comparar estados de
 * suporte compara nada com nada. Duas fontes de naturezas diferentes fazem o
 * teste de §13 medir o que ele diz medir: o estado que entra é o que sai.
 */
const FONTES_VERIFICADAS = [
  {
    domain: "www.aad.org", url: "https://www.aad.org/public/diseases/oily-skin",
    sourceType: "PROFESSIONAL_ORGANIZATION", classificationReason: "Associação profissional de dermatologia, com página institucional lida.",
    confidence: "HIGH" as const, signals: ["domínio institucional", "conteúdo revisado por profissionais"], provenance: "verified:2026-09-10",
  },
  {
    domain: "blog-parceiro.com.br", url: "https://blog-parceiro.com.br/pele-oleosa",
    sourceType: "COMMERCIAL", classificationReason: "Conteúdo comercial de marca, sem revisão profissional declarada.",
    confidence: "MEDIUM" as const, signals: ["loja no mesmo domínio"], provenance: "verified:2026-09-10",
  },
];

const SNAPSHOT = { query: "skincare para pele oleosa", organicResults: PAGINAS.map((item, index) => ({ position: index + 1, title: item.title, domain: `d${index}.com`, url: item.url })) };

const registro = () => startRadarDeepResearch({
  context: contexto(), plan: buildRadarResearchQueryPlan(contexto()), startedBy: "ator", now: "2026-09-10T09:00:00.000Z",
});

function vista(patch: Partial<Parameters<typeof buildRadarDeepResearchView>[0]> = {}) {
  const base = {
    context: contexto(), record: registro(), snapshot: SNAPSHOT as never,
    extractions: PAGINAS, observedAt: "2026-09-10T12:00:00.000Z",
    verifiedSources: FONTES_VERIFICADAS, ...patch,
  } as Parameters<typeof buildRadarDeepResearchView>[0];
  if (!base.record) return buildRadarDeepResearchView(base);

  const universo = buildRadarDeepResearchView(base);
  const curadoria = {
    universeFingerprint: radarResearchUniverseFingerprint(universo.references),
    confirmedAt: "2026-09-10T09:30:00.000Z", confirmedBy: "ator",
    references: universo.references.map(reference => ({
      referenceId: reference.referenceId, normalizedUrl: reference.normalizedUrl, url: reference.url,
      decision: autoDecideRadarReference(reference).decision, reason: "",
    })),
  };
  const recordBase = base.record as ReturnType<typeof registro>;
  return buildRadarDeepResearchView({
    ...base,
    record: { ...recordBase, researchCuration: curadoria },
    selectedReferences: curadoria.references.filter(item => item.decision !== "excluded" && item.decision !== "pending").length,
  });
}

/** A rodada congelada: a identidade da evidência, pela autoridade do Gate 15. */
function congelar(view = vista(), patch: Partial<Parameters<typeof freezeRadarEvidenceBundle>[0]> = {}) {
  const resultado = freezeRadarEvidenceBundle({
    readiness: radarFinalizationReadiness({
      started: true, stale: false, alreadyFinalized: false,
      pending: 0, analyzed: view.observed.sample.analyzedSuccess,
      failed: view.observed.sample.failedFinal, sufficiency: view.sufficiency,
    }),
    observed: view.observed, record: registro(), mode: "WEB", sufficiency: view.sufficiency,
    frozenBy: "ator", frozenAt: "2026-09-10T13:00:00.000Z",
    ...patch,
  });
  if (!resultado.ok) throw new Error(`fixture não congelou: ${resultado.reason}`);
  return resultado.bundle;
}


test("GATE 16 · AC — o Relatório lê a prontidão pela mesma autoridade do handoff", () => {
  const semCongelar = vista();
  const antes = buildRadarReportSummary({ observed: semCongelar.observed, view: semCongelar });
  const checkAntes = antes.checks.find(item => item.id === "handoff");
  assert.ok(checkAntes, "o Relatório tem a pergunta do pacote");
  assert.equal(checkAntes!.state, "PENDING");
  assert.match(checkAntes!.detail, /Finalize a pesquisa antes de preparar o pacote/);

  const finalizada = vista({ finalizedBundle: congelar() } as never);
  /*
   * 2026-10-09 · "PRONTO PARA O REDATOR" SÓ COM O ARTIGO-MODELO (regra do dono).
   * Com a planta concluída conferida, pronto; sem a conferência, a pergunta não
   * afirma prontidão; com a planta ausente, a mesma autoridade a bloqueia.
   */
  const depois = buildRadarReportSummary({ observed: finalizada.observed, view: finalizada, articleBlueprint: "APPROVED" });
  const checkDepois = depois.checks.find(item => item.id === "handoff");
  assert.equal(checkDepois!.state, "READY");
  assert.match(checkDepois!.detail, /Pronto para o Redator/);
  const semConferir = buildRadarReportSummary({ observed: finalizada.observed, view: finalizada }).checks.find(item => item.id === "handoff");
  assert.equal(semConferir!.state, "PENDING");
  assert.doesNotMatch(semConferir!.detail, /Pronto para o Redator/);
  const semPlanta = buildRadarReportSummary({ observed: finalizada.observed, view: finalizada, articleBlueprint: "MISSING" }).checks.find(item => item.id === "handoff");
  assert.equal(semPlanta!.state, "PENDING");
  assert.match(semPlanta!.detail, /artigo-modelo/);

  /*
   * A MESMA PERGUNTA, A MESMA RESPOSTA.
   *
   * O que a tela mostra e o que o construtor decide vêm da mesma função. Uma
   * regra reescrita em React é como a tela passa a prometer o que o domínio
   * recusa — e ninguém descobre até a hora de entregar.
   */
  const direto = radarHandoffReadiness({ article: ARTIGO, frozen: congelar(), stale: false });
  assert.equal(direto.ready, checkDepois!.state === "READY");
  /* 2026-10-09 · a mesma autoridade com a planta ausente: bloqueia pelo passo que falta, com a frase do Relatório. */
  const diretoSemPlanta = radarHandoffReadiness({ article: ARTIGO, frozen: congelar(), stale: false, articleBlueprint: "MISSING" });
  assert.equal(diretoSemPlanta.ready, false);
  assert.deepEqual(diretoSemPlanta.blocks.map(item => item.code), ["ARTICLE_BLUEPRINT_MISSING"]);
  assert.equal(semPlanta!.detail, diretoSemPlanta.blocks[0].message);
});

/* ==========  rede  ================================================== */

test("GATE 16 · AA — nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `REAL_PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});

/* =====================  especialista  ============================== */

const revisada = (decision: "ACCEPTED_EVIDENCE" | "REJECTED" | "NOT_APPROVED", id = "contribuicao-1") => ({
  extraction: radarSpecialistExtraction({
    contributionId: id, expertId: "especialista-1", briefId: "pauta-1",
    requirementId: "specialist:4a13e0cb", requirementKind: "RESOLVE_FACTUAL_UNCERTAINTY",
    requirementTopic: "O que causa acne",
    sourceType: "TEXT",
    originalText: "Oleosidade isolada não deve ser apresentada como causa direta da acne.",
    transcriptText: null, receivedAt: "2026-09-13T08:11:57.000Z",
    externalUpdateId: "update-1", decision,
  }),
  requirementQuestion: "O que pode ser afirmado com segurança neste ponto?",
  requirementKind: "RESOLVE_FACTUAL_UNCERTAINTY",
  sentQuestions: ["O que pode ser afirmado com segurança neste ponto?"],
  expertDisplayName: "Adalberto Escalante",
});

const camadaDeEspecialista = (sources = [revisada("ACCEPTED_EVIDENCE")]) => buildRadarSpecialistEvidenceLayer({
  binding: ARTIGO,
  preparedRequirements: 1,
  sources,
});

const dossieComEspecialista = (sources = [revisada("ACCEPTED_EVIDENCE")]) => buildRadarEvidenceBundle({
  observed: vista().observed,
  serp: { current: true, sufficient: true, valid: true },
  specialist: camadaDeEspecialista(sources),
});

test("SPECIALIST_3 · §9 · a camada viaja no dossiê, amarrada à mesma versão do ArticleDNA", () => {
  const dossie = dossieComEspecialista();
  assert.equal(dossie.specialist?.items.length, 1);
  assert.deepEqual(dossie.specialist?.binding, ARTIGO);
  /* Sem camada, o campo é `null` — que diz "não houve", e não "houve e está vazia". */
  assert.equal(buildRadarEvidenceBundle({ observed: vista().observed, serp: { current: true, sufficient: true, valid: true } }).specialist, null);
});

test("SPECIALIST_3 · §9 · uma camada de OUTRA versão do ArticleDNA não sai daqui", () => {
  /*
   * O pior caso desta camada: opinião profissional com nome e data chegando ao
   * Planejador sobre um artigo que já mudou. Pior que dado anônimo velho.
   */
  for (const patch of [{ articleId: "outro" }, { articleDnaVersionId: "outra" }, { articleDnaContentHash: "outro" }]) {
    assert.throws(
      () => buildRadarEvidenceBundle({
        observed: vista().observed,
        serp: { current: true, sufficient: true, valid: true },
        specialist: buildRadarSpecialistEvidenceLayer({ binding: { ...ARTIGO, ...patch }, preparedRequirements: 1, sources: [revisada("ACCEPTED_EVIDENCE")] }),
      }),
      /RADAR_EVIDENCE_BUNDLE_SPECIALIST_/,
      JSON.stringify(patch),
    );
  }
});

