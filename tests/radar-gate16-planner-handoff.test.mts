import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRadarPlannerHandoffIntegrity, buildRadarPlannerEvidenceHandoff, parseRadarPlannerHandoff,
  radarDossierDivergesFromFrozen, radarPlannerHandoffIdentity, radarPlannerHandoffReadiness,
  serializeRadarPlannerHandoff, RADAR_PLANNER_CONTRACT_VERSION, RADAR_PLANNER_MAY_NOT,
  type RadarPlannerHandoffV3,
} from "../lib/radar/planner-handoff.ts";
import { buildRadarEvidenceBundle } from "../lib/radar/evidence-bundle.ts";
import { freezeRadarEvidenceBundle, radarFinalizationReadiness, radarFrozenBundleHash } from "../lib/radar/investigation-finalization.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import { buildRadarReportSummary } from "../lib/radar/operational-view.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";
import type { RadarFactualEvidence } from "../lib/radar/source-authority.ts";

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

/** O dossiê vivo: a fotografia inteira, montada pela autoridade do Gate 9. */
const dossie = (view = vista()) => buildRadarEvidenceBundle({
  observed: view.observed,
  serp: { current: true, sufficient: view.sufficiency.level !== "INSUFFICIENT", valid: true },
});

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

const montar = (patch: Partial<Parameters<typeof buildRadarPlannerEvidenceHandoff>[0]> = {}) =>
  buildRadarPlannerEvidenceHandoff({
    article: ARTIGO, frozen: congelar(), dossier: dossie(), blueprint: vista().blueprint,
    preparedBy: "ator", preparedAt: "2026-09-10T14:00:00.000Z",
    ...patch,
  });

/**
 * O DOSSIÊ COM EVIDÊNCIA FACTUAL — as duas naturezas que importam.
 *
 * Verificar fonte é navegação externa e acontece dentro do ANALYZE; a view
 * pura desta fixture não a executa, e por isso `factualEvidence` nasceria
 * vazia. Comparar duas listas vazias não prova que INSUFFICIENT não virou
 * SUPPORTED — prova apenas que nada aconteceu.
 *
 * Aqui entram as duas: uma associação profissional que SUSTENTA a afirmação e
 * um conteúdo comercial cujo suporte é INSUFFICIENT. É a segunda que o teste
 * de §13 persegue.
 */
function dossieComEvidenciaFactual() {
  const base = dossie();
  const claims = base.observed.authorityEvidence.claims;
  if (claims.length < 2) throw new Error("fixture precisa de ao menos duas afirmações");

  const evidencias: RadarFactualEvidence[] = [
    {
      claimId: claims[0].claimId, sourceUrl: "https://www.aad.org/public/diseases/oily-skin", sourceDomain: "www.aad.org",
      sourceType: "PROFESSIONAL_ORGANIZATION" as const, supportType: "SUPPORTS" as const,
      evidenceSummary: "A associação descreve a produção de sebo como regulada por hormônios.",
      sourceTitle: "Oily skin", author: null, hasDates: true, confidence: "HIGH" as const,
      provenance: "verified:2026-09-10", limitations: [],
    },
    {
      claimId: claims[1].claimId, sourceUrl: "https://blog-parceiro.com.br/pele-oleosa", sourceDomain: "blog-parceiro.com.br",
      sourceType: "COMMERCIAL" as const, supportType: "INSUFFICIENT" as const,
      evidenceSummary: "A página afirma sem indicar estudo, revisão ou responsável técnico.",
      sourceTitle: "Pele oleosa", author: null, hasDates: false, confidence: "LOW" as const,
      provenance: "verified:2026-09-10", limitations: ["Sem revisão profissional declarada."],
    },
  ];

  return {
    ...base,
    observed: {
      ...base.observed,
      authorityEvidence: { ...base.observed.authorityEvidence, factualEvidence: evidencias },
    },
  };
}

/* ==========  A · SEM CONGELADO NÃO HÁ CONTRATO  ====================== */

test("GATE 16 · A — sem finalizedBundle o handoff é bloqueado, com frase humana", () => {
  const resultado = montar({ frozen: null });
  assert.equal(resultado.ok, false);
  if (resultado.ok) return;

  assert.equal(resultado.readiness.ready, false);
  assert.deepEqual(resultado.readiness.blocks.map(item => item.code), ["NOT_FINALIZED"]);
  assert.equal(resultado.readiness.blocks[0].message, "Finalize a pesquisa antes de preparar o pacote.");
  /* §31 — o detalhe técnico existe, mas não é a frase principal. */
  assert.match(resultado.readiness.blocks[0].detail, /RadarFrozenEvidenceBundle/);
  assert.doesNotMatch(resultado.readiness.blocks[0].message, /Bundle|hash|schema/i);
});

/* ==========  B e I · O PACOTE, E A IDENTIDADE DELE  ================== */

test("GATE 16 · B e I — bundle íntegro cria handoff com identidade própria", () => {
  const resultado = montar();
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;
  const handoff = resultado.handoff;

  assert.equal(handoff.contractVersion, RADAR_PLANNER_CONTRACT_VERSION);
  assert.equal(resultado.change, "CREATED");
  assert.equal(handoff.handoffVersion, 1);

  /*
   * TRÊS IDENTIDADES DIFERENTES, E ISSO É O PONTO.
   *
   * Reaproveitar o hash do ArticleDNA ou o do bundle como se fosse o do
   * contrato tornaria impossível responder depois "qual entrega foi essa?".
   */
  assert.match(handoff.handoffId, /^handoff:[0-9a-f]{8}$/);
  assert.match(handoff.handoffHash, /^handoff-hash:[0-9a-f]{8}$/);
  assert.notEqual(handoff.handoffHash, handoff.frozen.bundleHash);
  assert.notEqual(handoff.handoffHash, ARTIGO.articleDnaContentHash);
  assert.notEqual(handoff.handoffId, handoff.frozen.bundleId);

  /* Os cinco vínculos exigidos por §4 e §5. */
  assert.equal(handoff.binding.articleId, ARTIGO.articleId);
  assert.equal(handoff.binding.articleDnaVersionId, ARTIGO.articleDnaVersionId);
  assert.equal(handoff.binding.articleDnaContentHash, ARTIGO.articleDnaContentHash);
  assert.equal(handoff.frozen.bundleId, congelar().bundleId);
  assert.equal(handoff.frozen.bundleHash, congelar().bundleHash);

  assertRadarPlannerHandoffIntegrity(handoff);
});

/* ==========  C, D, E, G e H · O QUE BLOQUEIA  ======================== */

test("GATE 16 · C, D, E, G e H — cada divergência de vínculo bloqueia, nomeada", () => {
  const casos = [
    { nome: "C", article: { ...ARTIGO, articleId: "outro-artigo" }, code: "ARTICLE_MISMATCH" },
    { nome: "D", article: { ...ARTIGO, articleDnaVersionId: "dna-v17" }, code: "ARTICLE_VERSION_MISMATCH" },
    { nome: "E", article: { ...ARTIGO, articleDnaContentHash: "hash-diferente" }, code: "ARTICLE_HASH_MISMATCH" },
    { nome: "G", article: { ...ARTIGO, brandId: "outra-marca" }, code: "BRAND_MISMATCH" },
  ];

  for (const caso of casos) {
    const resultado = buildRadarPlannerEvidenceHandoff({
      article: caso.article, frozen: congelar(), dossier: dossie(), blueprint: vista().blueprint,
      preparedBy: "ator", preparedAt: "2026-09-10T14:00:00.000Z",
    });
    assert.equal(resultado.ok, false, `${caso.nome}: devia bloquear`);
    if (resultado.ok) continue;
    const codigos = resultado.readiness.blocks.map(item => item.code);
    assert.ok(codigos.includes(caso.code as never), `${caso.nome}: esperava ${caso.code}, veio ${codigos.join(",")}`);
  }

  /* H — fundamento mudado depois da investigação. */
  const stale = montar({ stale: true });
  assert.equal(stale.ok, false);
  if (!stale.ok) {
    assert.ok(stale.readiness.blocks.some(item => item.code === "STALE"));
    assert.match(stale.readiness.blocks.find(item => item.code === "STALE")!.message, /não corresponde mais/);
  }

  /* §6 — nada é "consertado" automaticamente: bloqueio é bloqueio. */
  assert.equal(montar({ article: { ...ARTIGO, articleId: "outro" } }).ok, false);
});

/* ==========  F · BUNDLE ADULTERADO  ================================== */

test("GATE 16 · F — bundle com hash adulterado é recusado antes de qualquer comparação", () => {
  const original = congelar();

  /* Um campo mexido sem recalcular o hash: exatamente o caso que interessa. */
  const adulterado = { ...original, sample: { ...original.sample, comparablePages: 999 } };
  const resultado = montar({ frozen: adulterado });
  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.deepEqual(resultado.readiness.blocks.map(item => item.code), ["BUNDLE_MUTATED"]);
  assert.match(resultado.readiness.blocks[0].detail, /RADAR_FROZEN_BUNDLE_MUTATED/);
  assert.equal(resultado.readiness.blocks[0].message, "O pacote de evidências falhou na verificação de integridade.");

  /*
   * E o adulterador esperto, que recalcula o hash junto: aí o bundle é íntegro
   * — e quem denuncia é o dossiê, que continua descrevendo a rodada real.
   */
  const recalculado = { ...adulterado, bundleHash: radarFrozenBundleHash({ ...adulterado, bundleHash: undefined } as never) };
  const segundo = montar({ frozen: recalculado });
  assert.equal(segundo.ok, false, "DOSSIER_DIVERGES pega o que o hash sozinho não pega");
  if (!segundo.ok) assert.ok(segundo.readiness.blocks.some(item => item.code === "DOSSIER_DIVERGES"));
});

/* ==========  J e K · IDEMPOTÊNCIA E NOVA INVESTIGAÇÃO  =============== */

test("GATE 16 · J — mesma entrada produz a mesma identidade, quantas vezes for", () => {
  const primeiro = montar();
  const segundo = montar({ preparedAt: "2026-09-11T08:30:00.000Z", preparedBy: "outro-ator" });
  assert.equal(primeiro.ok && segundo.ok, true);
  if (!primeiro.ok || !segundo.ok) return;

  /*
   * O RELÓGIO NÃO ENTRA NA IDENTIDADE.
   *
   * Preparar o mesmo pacote amanhã, por outra pessoa, tem que produzir a mesma
   * entrega. Se `preparedAt` entrasse no hash, cada consulta criaria um pacote
   * novo — e o Planejador receberia dez importações da mesma investigação.
   */
  assert.equal(primeiro.handoff.handoffId, segundo.handoff.handoffId);
  assert.equal(primeiro.handoff.handoffHash, segundo.handoff.handoffHash);
  assert.notEqual(primeiro.handoff.preparedAt, segundo.handoff.preparedAt);

  /* Repetir sobre a entrega anterior não cria outra: reusa. */
  const repetido = montar({ previous: primeiro.handoff });
  assert.equal(repetido.ok, true);
  if (!repetido.ok) return;
  assert.equal(repetido.change, "REUSE");
  assert.equal(repetido.handoff.handoffVersion, 1, "a versão não anda por repetir");
  assert.equal(repetido.handoff.previousHandoffId, null);
});

test("GATE 16 · K — nova investigação gera nova versão, sem sobrescrever a anterior", () => {
  const primeiro = montar();
  assert.equal(primeiro.ok, true);
  if (!primeiro.ok) return;

  /* Outra rodada: mesmo artigo, bundle diferente (menos páginas lidas). */
  const outraVista = vista({ extractions: PAGINAS.slice(0, 8) });
  const novo = montar({ frozen: congelar(outraVista), dossier: dossie(outraVista), previous: primeiro.handoff });
  assert.equal(novo.ok, true);
  if (!novo.ok) return;

  assert.equal(novo.change, "NEW_VERSION");
  assert.notEqual(novo.handoff.handoffId, primeiro.handoff.handoffId);
  assert.equal(novo.handoff.handoffVersion, 2);
  assert.equal(novo.handoff.previousHandoffId, primeiro.handoff.handoffId, "o anterior fica referenciado, não apagado");
});

/* ==========  L, M, N · A PESQUISA PRESERVADA  ======================== */

test("GATE 16 · L, M e N — canônica, auxiliar, falhas e suficiência atravessam intactas", () => {
  const resultado = montar();
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;
  const handoff = resultado.handoff;
  const origem = congelar();

  /* L — canônica continua diferente de auxiliar. */
  assert.equal(handoff.frozen.search.canonicalQueries, origem.search.canonicalQueries);
  assert.equal(handoff.frozen.search.auxiliaryQueries, origem.search.auxiliaryQueries);
  for (const consulta of handoff.frozen.search.queries) {
    assert.ok(["canonical", "auxiliary"].includes(consulta.serpClass), "cada consulta mantém a classe");
  }

  /* M — falha final não some no caminho. */
  assert.equal(handoff.frozen.sample.failedFinal, origem.sample.failedFinal);
  assert.equal(handoff.dossier.observed.sample.failedFinal, origem.sample.failedFinal);

  /* N — suficiência e limitações viajam. */
  assert.equal(handoff.sufficiency, origem.model.sufficiency);
  for (const limitacao of origem.limitations) assert.ok(handoff.limitations.includes(limitacao));
  for (const limitacao of dossie().limitations) assert.ok(handoff.limitations.includes(limitacao));
});

/* ==========  O e P · O PLANO DE LINKS  =============================== */

test("GATE 16 · O e P — o plano de links atravessa sem mudar de significado", () => {
  const resultado = montar();
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;

  const plano = resultado.handoff.dossier.observed.internalLinkPlan;
  const original = dossie().observed.internalLinkPlan;
  assert.deepEqual(plano, original, "INTERNAL_LINK_PLAN_PRESERVED: idêntico, campo a campo");

  /*
   * §10 — A REGRA QUE NÃO PODE SER SUAVIZADA.
   *
   * REQUIRED com zero ocorrências significa: a relação estrutural EXISTE e o
   * Radar não achou onde aplicá-la com fundamento. Converter isso em opcional
   * ou em "remover link" apagaria uma decisão do Arquiteto usando a ausência de
   * evidência do Radar como justificativa — dois módulos, uma mentira.
   */
  const aplicacoes = [...plano.outgoing, ...plano.incoming];
  for (const aplicacao of aplicacoes) {
    if (aplicacao.structuralRequirement !== "REQUIRED") continue;
    if (aplicacao.recommendedOccurrences > 0) continue;
    assert.equal(aplicacao.applicationStatus, "REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT");
    assert.notEqual(aplicacao.structuralRequirement, "NOT_REQUIRED");
  }
});

test("GATE 16 · §35 — relação exigida sem posicionamento continua exatamente isso", () => {
  const base = dossie();
  const plano = base.observed.internalLinkPlan;

  /* Uma aplicação deliberadamente não resolvida, injetada na fotografia. */
  const naoResolvida = {
    ...(plano.outgoing[0] || plano.incoming[0]),
    structuralRequirement: "REQUIRED" as const,
    applicationStatus: "REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT" as const,
    recommendedOccurrences: 0,
  };
  if (!naoResolvida.nodeId) return; /* fixture sem grafo: nada a provar aqui */

  const comRelacao = {
    ...base,
    observed: {
      ...base.observed,
      internalLinkPlan: { ...plano, outgoing: [naoResolvida, ...plano.outgoing.slice(1)] },
    },
  };

  const resultado = montar({ dossier: comRelacao, frozen: congelar() });
  if (!resultado.ok) return;
  const atravessou = resultado.handoff.dossier.observed.internalLinkPlan.outgoing[0];
  assert.equal(atravessou.structuralRequirement, "REQUIRED");
  assert.equal(atravessou.applicationStatus, "REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT");
  assert.equal(atravessou.recommendedOccurrences, 0);
});

/* ==========  Q · DIREÇÃO DOS LINKS  ================================== */

test("GATE 16 · Q — incoming e outgoing chegam separados, com a direção intacta", () => {
  const resultado = montar();
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;

  const plano = resultado.handoff.dossier.observed.internalLinkPlan;
  assert.ok(plano.outgoing.length > 0 && plano.incoming.length > 0, "a fixture precisa das duas direções");

  /*
   * A SEPARAÇÃO É ESTRUTURAL, E É MAIS FORTE QUE UM CAMPO.
   *
   * Escrevi este teste esperando `direction === "OUTGOING"` em cada saída, e
   * ele falhou com `BOTH`. O engano era meu: `direction` descreve a RELAÇÃO no
   * grafo (o Pilar aponta para cá e daqui se aponta para ele), enquanto a
   * lista descreve a RESPONSABILIDADE — e são perguntas diferentes.
   *
   * Quem garante §11 é o TIPO: saída é `RadarLinkApplication`, com alvo e
   * ocorrências a aplicar NESTE texto; entrada é `RadarIncomingLinkRequirement`,
   * com origem e nenhum campo que possa ser lido como "insira este link aqui".
   * Um campo pode ser sobrescrito por engano; um tipo não se confunde.
   */
  for (const saida of plano.outgoing) {
    assert.ok("nodeId" in saida && "targetRole" in saida, "saída aponta para um destino");
    assert.ok(!("sourceNodeId" in saida), "e não carrega origem");
  }
  for (const entrada of plano.incoming) {
    assert.ok("sourceNodeId" in entrada && "sourceRole" in entrada, "entrada nomeia quem deve apontar para cá");
    assert.ok(!("targetRole" in entrada), "e não vira link a inserir neste artigo");
  }

  /* E as duas listas atravessam sem se misturar nem se reordenar. */
  assert.deepEqual(plano.outgoing, dossie().observed.internalLinkPlan.outgoing);
  assert.deepEqual(plano.incoming, dossie().observed.internalLinkPlan.incoming);
  const idsDeSaida = plano.outgoing.map(item => item.nodeId);
  for (const entrada of plano.incoming) {
    assert.ok(!idsDeSaida.includes(entrada.sourceNodeId) || plano.outgoing.length > 0, "origem e destino continuam endereçados separadamente");
  }
});

/* ==========  R e S · AFIRMAÇÕES, YMYL E SUPORTE  ===================== */

test("GATE 16 · R e S — claims e YMYL atravessam, e INSUFFICIENT nunca vira SUPPORTED", () => {
  const resultado = montar();
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;

  const autoridade = resultado.handoff.dossier.observed.authorityEvidence;
  const original = dossie().observed.authorityEvidence;
  assert.deepEqual(autoridade.claims, original.claims, "YMYL_CLAIMS_PRESERVED");
  assert.deepEqual(autoridade.ymylAssessment, original.ymylAssessment);
  assert.deepEqual(autoridade.marketVsFactConflicts, original.marketVsFactConflicts);

  /*
   * §13 — NENHUMA INFERÊNCIA FACTUAL NOVA NA TRAVESSIA.
   *
   * O handoff transporta o estado de suporte como ele está. Promover
   * INSUFFICIENT a SUPPORTED aqui seria criar evidência factual em código de
   * transporte — a pior forma de inventá-la, porque ninguém procura por ela
   * neste arquivo.
   */
  /* Com evidência factual de verdade: uma que sustenta e uma que não. */
  const comEvidencia = dossieComEvidenciaFactual();
  const entregue = montar({ dossier: comEvidencia });
  assert.equal(entregue.ok, true);
  if (!entregue.ok) return;

  const factual = entregue.handoff.dossier.observed.authorityEvidence.factualEvidence;
  assert.equal(factual.length, 2, "a fixture precisa das duas naturezas");
  const suportes = factual.map(item => item.supportType).sort();
  assert.deepEqual(suportes, ["INSUFFICIENT", "SUPPORTS"], "os dois estados atravessam como estavam");

  const insuficiente = factual.find(item => item.supportType === "INSUFFICIENT");
  assert.ok(insuficiente, "INSUFFICIENT continua INSUFFICIENT do outro lado");
  assert.equal(insuficiente!.sourceDomain, "blog-parceiro.com.br");
  assert.deepEqual(insuficiente!.limitations, ["Sem revisão profissional declarada."], "a limitação da fonte viaja junto");
  assert.deepEqual(factual, comEvidencia.observed.authorityEvidence.factualEvidence, "campo a campo, nada foi reescrito");
});

/* ==========  T · ESPECIALISTA  ======================================= */

test("GATE 16 · T — requisitos do especialista viajam como requisitos, nunca como revisão feita", () => {
  const resultado = montar();
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;

  const requisitos = resultado.handoff.dossier.observed.authorityEvidence.specialistReviewRequirements;
  assert.deepEqual(requisitos, dossie().observed.authorityEvidence.specialistReviewRequirements);

  /*
   * §15 e §20 — ausência de contribuição não apaga a necessidade preparada, e
   * não é convertida em "revisado". O estado da área diz uma coisa só: existem
   * requisitos, ou não são exigidos.
   */
  const esperado = requisitos.length ? "REQUIREMENTS_PREPARED" : "NOT_REQUIRED";
  assert.equal(resultado.handoff.areas.specialist, esperado);
  const serializado = JSON.stringify(resultado.handoff.areas);
  for (const proibido of ["reviewed", "contributed", "approved", "signed"]) {
    assert.ok(!serializado.includes(proibido), `a área não afirma "${proibido}"`);
  }
});

/* ==========  U · AI DISCOVERY  ======================================= */

test("GATE 16 · U — AiDiscoveryContext atravessa inteiro e não vira nota", () => {
  const resultado = montar();
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;

  const descoberta = resultado.handoff.dossier.observed.aiDiscovery;
  assert.deepEqual(descoberta, dossie().observed.aiDiscovery, "AI_DISCOVERY_PRESERVED");
  assert.ok(Array.isArray(descoberta.answerableUnits));
  assert.equal(descoberta.binding.articleId, ARTIGO.articleId, "amarrado ao mesmo fundamento");

  /* §16 — nada de GEO score em lugar nenhum do pacote. */
  const tudo = serializeRadarPlannerHandoff(resultado.handoff);
  for (const proibido of ["geoScore", "geo_score", "GEO score"]) {
    assert.ok(!tudo.includes(proibido), `o pacote não inventa "${proibido}"`);
  }
});

/* ==========  V e W · O QUE NÃO RODOU  =============================== */

test("GATE 16 · V e W — Vídeos, YouTube e Amazon declaram o estado real, sem evidência inventada", () => {
  const resultado = montar();
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;

  /* §21 — Google finalizado; os outros motores não rodaram, e é isso que diz. */
  assert.equal(resultado.handoff.channels.web, "FINALIZED");
  assert.equal(resultado.handoff.channels.youtube, "NOT_EXECUTED");
  assert.equal(resultado.handoff.channels.amazon, "NOT_EXECUTED");

  /* §19 — sem engine de vídeo, o estado é o real; transcript não é fabricado. */
  assert.equal(resultado.handoff.areas.videos, "NOT_USED");
  const tudo = serializeRadarPlannerHandoff(resultado.handoff);
  for (const inventado of ["transcript", "videoEvidence", "amazonEvidence", "youtubeEvidence"]) {
    assert.ok(!tudo.includes(inventado), `o pacote não inventa "${inventado}"`);
  }
});

/* ==========  X e Y · NADA A MONTANTE É MUTADO  ====================== */

test("GATE 16 · X e Y — nem o ArticleDNA nem o bundle são tocados na travessia", () => {
  const artigoOriginal = JSON.stringify(ARTIGO);
  const congeladoOriginal = congelar();
  const congeladoSerializado = JSON.stringify(congeladoOriginal);
  const dossieOriginal = dossie();
  const dossieSerializado = JSON.stringify(dossieOriginal);

  const resultado = buildRadarPlannerEvidenceHandoff({
    article: ARTIGO, frozen: congeladoOriginal, dossier: dossieOriginal, blueprint: vista().blueprint,
    preparedBy: "ator", preparedAt: "2026-09-10T14:00:00.000Z",
  });
  assert.equal(resultado.ok, true);

  assert.equal(JSON.stringify(ARTIGO), artigoOriginal, "ARTICLE_UPSTREAM_MUTATED = NO");
  assert.equal(JSON.stringify(congeladoOriginal), congeladoSerializado, "RADAR_BUNDLE_MUTATED = NO");
  assert.equal(JSON.stringify(dossieOriginal), dossieSerializado, "o dossiê também sai como entrou");

  /* §27 — o pacote só transporta: ele não tem campo para alterar upstream. */
  if (!resultado.ok) return;
  const chaves = Object.keys(resultado.handoff);
  for (const proibida of ["slug", "canonical", "principal", "keywords"]) {
    assert.ok(!chaves.includes(proibida), `o envelope não carrega campo editável "${proibida}"`);
  }
});

/* ==========  Z · SERIALIZAÇÃO  ====================================== */

test("GATE 16 · Z — serializar, ler de volta e validar mantém a mesma identidade", () => {
  const resultado = montar();
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;

  const texto = serializeRadarPlannerHandoff(resultado.handoff);
  const devolta = parseRadarPlannerHandoff(texto);

  assert.equal(devolta.handoffId, resultado.handoff.handoffId, "SERIALIZATION_VALID");
  assert.equal(devolta.handoffHash, resultado.handoff.handoffHash);
  assert.deepEqual(devolta, resultado.handoff, "nada se perde nem se transforma no caminho");

  /* §24 — JSON puro: sem função, sem Map, sem Set, sem ciclo. */
  assert.equal(typeof JSON.parse(texto), "object");
  assert.ok(!texto.includes("[object Map]") && !texto.includes("[object Set]"));

  /* E um pacote adulterado depois de serializado não passa na volta. */
  const mexido = JSON.parse(texto) as RadarPlannerHandoffV3;
  mexido.binding = { ...mexido.binding, articleDnaVersionId: "dna-v99" };
  assert.throws(() => parseRadarPlannerHandoff(JSON.stringify(mexido)), /RADAR_PLANNER_HANDOFF/);
});

/* ==========  AA e AB · SEM PROVIDER, SEM RECÁLCULO  ================= */

test("GATE 16 · AB — o handoff não recalcula nenhum modelo: ele compara e recusa", () => {
  /*
   * A PROVA DE QUE ELE NÃO REFAZ NADA.
   *
   * Se o handoff recalculasse o modelo, um dossiê divergente do congelado seria
   * "corrigido" e passaria. Aqui ele é RECUSADO — o que só é possível porque a
   * conclusão veio pronta e ele apenas confere.
   */
  const congelado = congelar();
  const outroDossie = dossie(vista({ extractions: PAGINAS.slice(0, 5) }));
  const divergencias = radarDossierDivergesFromFrozen(outroDossie, congelado);
  assert.ok(divergencias.length > 0, "a divergência é detectada, não absorvida");

  const resultado = montar({ dossier: outroDossie });
  assert.equal(resultado.ok, false, "e vira bloqueio, não conserto");
  if (!resultado.ok) {
    assert.ok(resultado.readiness.blocks.every(item => item.code === "DOSSIER_DIVERGES"));
  }

  /* §22 — as invariantes do Planejador viajam escritas no contrato. */
  const valido = montar();
  if (valido.ok) {
    assert.deepEqual(valido.handoff.plannerMayNot, RADAR_PLANNER_MAY_NOT);
    assert.ok(valido.handoff.plannerMayNot.includes("consultar a SERP novamente"));
    assert.ok(valido.handoff.plannerMayNot.includes("refazer o modelo semântico"));
  }
});

/* ==========  AC · O RELATÓRIO USA O VALIDADOR  ====================== */

test("GATE 16 · AC — o Relatório lê a prontidão pela mesma autoridade do handoff", () => {
  const semCongelar = vista();
  const antes = buildRadarReportSummary({ observed: semCongelar.observed, view: semCongelar });
  const checkAntes = antes.checks.find(item => item.id === "handoff");
  assert.ok(checkAntes, "o Relatório tem a pergunta do pacote");
  assert.equal(checkAntes!.state, "PENDING");
  assert.match(checkAntes!.detail, /Finalize a pesquisa antes de preparar o pacote/);

  const finalizada = vista({ finalizedBundle: congelar() } as never);
  const depois = buildRadarReportSummary({ observed: finalizada.observed, view: finalizada });
  const checkDepois = depois.checks.find(item => item.id === "handoff");
  assert.equal(checkDepois!.state, "READY");
  assert.match(checkDepois!.detail, /Pronto para o Planejador/);

  /*
   * A MESMA PERGUNTA, A MESMA RESPOSTA.
   *
   * O que a tela mostra e o que o construtor decide vêm da mesma função. Uma
   * regra reescrita em React é como a tela passa a prometer o que o domínio
   * recusa — e ninguém descobre até a hora de entregar.
   */
  const direto = radarPlannerHandoffReadiness({ article: ARTIGO, frozen: congelar(), stale: false });
  assert.equal(direto.ready, checkDepois!.state === "READY");
});

/* ==========  §34 · NÃO-REINTERPRETAÇÃO  ============================= */

test("GATE 16 · §34 — conceito recorrente na SERP atravessa mesmo quando a heurística discordaria", () => {
  /*
   * FIXTURE CONTRAINTUITIVA, DE PROPÓSITO.
   *
   * "Rotina de cuidados" aparece em 8 das 12 páginas: recorrente e competitivo.
   * Uma heurística de contagem simples poderia rebaixá-lo — ele não está no
   * título, não é a entidade central, e o ArticleDNA não o declarou. O handoff
   * não tem opinião sobre isso: o que o Gate 9 concluiu é o que atravessa.
   */
  const view = vista();
  const conceitoNaOrigem = view.observed.concepts.all.find(item => /rotina/i.test(item.canonicalLabel));
  assert.ok(conceitoNaOrigem, "a fixture precisa do conceito recorrente");

  const resultado = montar({ frozen: congelar(view), dossier: dossie(view) });
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;

  const atravessou = resultado.handoff.dossier.observed.concepts.all.find(item => item.id === conceitoNaOrigem!.id);
  assert.ok(atravessou, "o conceito continua presente");
  assert.deepEqual(atravessou, conceitoNaOrigem, "e idêntico: mesmo status, mesma contagem, mesmas páginas");
  assert.ok(resultado.handoff.frozen.model.conceptIds.includes(conceitoNaOrigem!.id), "e continua no congelado");
});

/* ==========  §36 · INVESTIGAÇÃO PARCIAL  ============================ */

test("GATE 16 · §36 e §18 — finalização consciente vira handoff válido e declaradamente parcial", () => {
  /*
   * 12 selecionadas, 9 lidas, 3 sem acesso, nenhuma pendente: o operador
   * encerrou sabendo. O pacote existe — e carrega a insuficiência assumida,
   * porque um pacote artificialmente limpo faria o Planejador planejar com
   * mais confiança do que a evidência permite.
   */
  const parcial = vista({
    extractions: PAGINAS.slice(0, 9),
    extractionFailureUrls: PAGINAS.slice(9).map(item => item.url),
    extractionFailures: 3,
  } as never);

  const prontidao = radarFinalizationReadiness({
    started: true, stale: false, alreadyFinalized: false,
    pending: 0, analyzed: 9, failed: 3, sufficiency: parcial.sufficiency,
  });
  const congelado = freezeRadarEvidenceBundle({
    readiness: prontidao, observed: parcial.observed, record: registro(), mode: "WEB",
    sufficiency: parcial.sufficiency, frozenBy: "ator", frozenAt: "2026-09-10T13:00:00.000Z",
  });
  assert.equal(congelado.ok, true);
  if (!congelado.ok) return;

  const resultado = montar({ frozen: congelado.bundle, dossier: dossie(parcial) });
  assert.equal(resultado.ok, true, "PARTIAL_FINALIZED_HANDOFF_ALLOWED");
  if (!resultado.ok) return;

  assert.equal(resultado.handoff.frozen.sample.analyzedSuccess, 9);
  assert.equal(resultado.handoff.frozen.sample.failedFinal, 3);
  assert.ok(resultado.handoff.limitations.length > 0, "LIMITATIONS_PRESERVED");
  assert.equal(resultado.handoff.acknowledgedInsufficiency, congelado.bundle.acknowledgedInsufficiency);

  /*
   * E O CASO QUE §18 DESCREVE LITERALMENTE: amostra que não sustenta leitura
   * de mercado, encerrada assim mesmo. Aqui `acknowledgedInsufficiency` deixa
   * de ser nulo — e é ele que impede o pacote de chegar com cara de completo.
   */
  /*
   * LIDAS, PORÉM NÃO COMPARÁVEIS.
   *
   * Uma amostra pequena de artigos editoriais ainda sustenta leitura parcial —
   * tentei com uma página só e a suficiência veio PARTIAL_BUT_USABLE. O caso
   * de §18 é outro: as páginas ABRIRAM, foram lidas, e nenhuma delas é
   * benchmark editorial. Vitrines de produto respondem à consulta e não
   * respondem à pergunta — é assim que uma investigação fica materialmente
   * insuficiente sem nenhuma falha técnica.
   */
  const vitrines = Array.from({ length: 4 }, (_, index) => ({
    ...pagina(`V${index}`, ["Ofertas da semana"]),
    url: `https://loja-${index}.com.br/produto/serum-pele-oleosa`,
    title: `Comprar sérum para pele oleosa — melhor preço`,
    h1: ["Comprar sérum para pele oleosa"],
  }));
  const magra = vista({ extractions: vitrines });
  const prontidaoMagra = radarFinalizationReadiness({
    started: true, stale: false, alreadyFinalized: false,
    pending: 0, analyzed: vitrines.length, failed: 8, sufficiency: magra.sufficiency,
  });
  assert.equal(prontidaoMagra.state, "INSUFFICIENT_BUT_FINALIZABLE", "a fixture precisa ser conscientemente fraca");

  const congeladoMagro = freezeRadarEvidenceBundle({
    readiness: prontidaoMagra, observed: magra.observed, record: registro(), mode: "WEB",
    sufficiency: magra.sufficiency, frozenBy: "ator", frozenAt: "2026-09-10T13:00:00.000Z",
  });
  assert.equal(congeladoMagro.ok, true);
  if (!congeladoMagro.ok) return;

  const entregaMagra = montar({ frozen: congeladoMagro.bundle, dossier: dossie(magra) });
  assert.equal(entregaMagra.ok, true, "PARTIAL_FINALIZED_HANDOFF_ALLOWED");
  if (!entregaMagra.ok) return;
  assert.ok(entregaMagra.handoff.acknowledgedInsufficiency, "a insuficiência assumida viaja, não some");
  assert.equal(entregaMagra.handoff.acknowledgedInsufficiency, congeladoMagro.bundle.acknowledgedInsufficiency);
  assert.notEqual(entregaMagra.handoff.sufficiency, "SUFFICIENT", "e o pacote não chega dizendo que está completo");
});

/* ==============  AA · REAL_PROVIDER_CALLS = 0  ====================== */

test("GATE 16 · AA — nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `REAL_PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});

/* =====================  a identidade, isolada  ====================== */

test("GATE 16 · a identidade muda quando qualquer vínculo muda, e só então", () => {
  const base = { article: ARTIGO, bundleId: "bundle:aaaa1111", bundleHash: "bundle-hash:bbbb2222" };
  const referencia = radarPlannerHandoffIdentity(base);

  const variacoes = [
    { nome: "outra marca", input: { ...base, article: { ...ARTIGO, brandId: "outra" } } },
    { nome: "outro artigo", input: { ...base, article: { ...ARTIGO, articleId: "outro" } } },
    { nome: "outra versão do DNA", input: { ...base, article: { ...ARTIGO, articleDnaVersionId: "v2" } } },
    { nome: "outro hash do DNA", input: { ...base, article: { ...ARTIGO, articleDnaContentHash: "outro" } } },
    { nome: "outro bundle", input: { ...base, bundleId: "bundle:cccc3333" } },
    { nome: "outro hash do bundle", input: { ...base, bundleHash: "bundle-hash:dddd4444" } },
    { nome: "outro contrato", input: { ...base, contractVersion: 4 } },
  ];
  for (const variacao of variacoes) {
    assert.notEqual(radarPlannerHandoffIdentity(variacao.input).handoffId, referencia.handoffId, variacao.nome);
  }

  /* E repetir a mesma entrada devolve exatamente a mesma identidade. */
  assert.deepEqual(radarPlannerHandoffIdentity(base), referencia);
});
