import assert from "node:assert/strict";
import test from "node:test";
import { resolveApprovedArticleSerpGate } from "../lib/arquiteto/approved-article-serp-gate.ts";
import { serpIntentReadingOf } from "../lib/arquiteto/article-serp-interpretation.ts";
import { applySerpDecisionToArticle, buildClassificationEvidence, resolveArticleClassification } from "../lib/arquiteto/article-classification-closure.ts";

/* ---------------- o portão do Radar lê a SERP do ArticleDNA aprovado ---------------- */

const lentes = { requested: ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"], observed: ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"], missing: [] };
const registro = (extra: Record<string, unknown> = {}) => ({
  candidateRef: "18fcec03",
  payload: {
    formationBaseHash: "serpbase:6cedda6a42f1f5b8",
    verdict: "COMPATIBLE",
    assessment: { id: "serp-formation:marca:18fcec03:v1", recommendations: [{ keywordId: "p", currentRole: "principal" }, { keywordId: "a", currentRole: "secundaria" }, { keywordId: "b", currentRole: "secundaria" }] },
    interpretation: { lenses: lentes },
    humanResolution: { formationBaseHash: "serpbase:6cedda6a42f1f5b8" },
    ...extra,
  },
});
const dna = {
  serpAssessmentRef: { versionId: "serp-formation:marca:18fcec03:v1:serpbase:6cedda6a42f1f5b8" },
  principalKeywordId: "p",
  keywordReferences: [{ keywordId: "p", role: "principal" }, { keywordId: "a", role: "secundaria" }, { keywordId: "b", role: "secundaria" }],
};

test("ArticleDNA aprovado com parecer completo e aceito passa no portão do Radar, mesmo com a mesa mudada depois (caso real 'cosméticos' e 'dentistas', 2026-10-01)", () => {
  const gate = resolveApprovedArticleSerpGate({ articleId: "18fcec03", dna, records: [registro()] });
  assert.ok(gate);
  assert.equal(gate.state, "current_supported");
  assert.equal(gate.blocksConclusion, false);
});

test("parecer de outra composição, ausente ou com lente faltando não vale pelo DNA: o portão da mesa decide, como antes", () => {
  assert.equal(resolveApprovedArticleSerpGate({ articleId: "18fcec03", dna: { ...dna, serpAssessmentRef: null }, records: [registro()] }), null);
  assert.equal(resolveApprovedArticleSerpGate({ articleId: "18fcec03", dna, records: [] }), null);
  const outraComposicao = { ...dna, keywordReferences: [...dna.keywordReferences, { keywordId: "c", role: "secundaria" }] };
  assert.equal(resolveApprovedArticleSerpGate({ articleId: "18fcec03", dna: outraComposicao, records: [registro()] }), null);
  const semLente = registro({ interpretation: { lenses: { ...lentes, observed: ["desktop-windows"], missing: [{ lens: "desktop-macos" }] } } });
  assert.equal(resolveApprovedArticleSerpGate({ articleId: "18fcec03", dna, records: [semLente] }), null);
});

/* ---------------- intenção e funil pelas 4 lentes, com porcentagem ---------------- */

const resultado = (title: string, inferredType = "article") => ({ title, snippet: "", url: "https://exemplo.com/x", domain: "exemplo.com", position: 1, inferredType });

test("a SERP lê as 4 lentes: a intenção de maior participação vence mesmo baixa, com a porcentagem e o funil", () => {
  const lente = (titulos: string[]) => ({ members: [{ results: titulos.map(titulo => resultado(titulo, "other")) }] });
  const leitura = serpIntentReadingOf([
    lente(["como fazer tráfego orgânico", "guia de tráfego", "melhor agência"]),
    lente(["o que é tráfego orgânico", "dicas de seo", "comprar curso"]),
    lente(["tutorial de seo", "ranking de agências"]),
    lente(["passo a passo do google"]),
  ]);
  assert.equal(leitura.intent, "informacional");
  assert.equal(leitura.funnel, "topo");
  assert.equal(leitura.lenses, 4);
  assert.equal(leitura.results, 9);
  assert.equal(leitura.shares.informacional + leitura.shares.comercial + leitura.shares.transacional >= 99, true);
  assert.ok(leitura.shares.informacional > leitura.shares.comercial);
  // Sem nenhum sinal: indefinido (falta coleta, não opinião).
  assert.equal(serpIntentReadingOf([{ members: [] }]).intent, "indefinido");
});

/* ---------------- a SERP tem a última palavra na classificação ---------------- */

const kgr = { principalKgrScore: null, principalApplicability: "not_applicable" as const, fullKgr: false, source: "DEFAULT", decision: "NOT_APPLICABLE", requiresHumanDecision: false, applyKgr: false };
const evidencia = (serp: { observedIntent: string; observedFunnel?: string | null } | null, principal = "Comercial", funil: string | null = "Meio") => buildClassificationEvidence({
  principal: { intent: principal, funnel: funil },
  secondaries: [{ intent: "Comercial", funnel: "Meio" }],
  keywordCount: 2,
  serpInterpretation: serp ? { ...serp, intentShares: { informacional: 61, comercial: 30, transacional: 9, lenses: 4, results: 40 } } : null,
  serpResolved: Boolean(serp),
  kgr,
  principalIsSubject: false,
  isPublished: false,
  principalProtected: false,
});

test("Minerador diz Comercial, a SERP mostra informacional: vale a SERP, e o motivo diz a porcentagem e o que o Minerador declarava (dono, 2026-10-01)", () => {
  const classificacao = resolveArticleClassification(evidencia({ observedIntent: "informacional", observedFunnel: "topo" }));
  assert.equal(classificacao.intent.value, "INFORMATIONAL");
  assert.equal(classificacao.intent.source, "serp");
  assert.match(classificacao.intent.reason, /informacional 61%/);
  assert.match(classificacao.intent.reason, /O Minerador declarava COMMERCIAL_INVESTIGATION; a SERP corrige/);
  assert.equal(classificacao.funnel.value, "TOP");
  assert.equal(classificacao.funnel.source, "serp");
});

test("keyword sem intenção no Minerador: a SERP preenche; sem SERP, vale o Minerador como antes", () => {
  assert.equal(resolveArticleClassification(evidencia({ observedIntent: "comercial", observedFunnel: "meio" }, "Pendente", null)).intent.value, "COMMERCIAL_INVESTIGATION");
  const semSerp = resolveArticleClassification(evidencia(null));
  assert.equal(semSerp.intent.value, "COMMERCIAL_INVESTIGATION");
  assert.equal(semSerp.intent.source, "principal");
});

test("o ArticleDNA grava o que a SERP decidiu: intenção, perfil e funil; sem SERP decidindo, nada muda", () => {
  const classificacao = resolveArticleClassification(evidencia({ observedIntent: "informacional", observedFunnel: "topo" }));
  const artigo = { mainIntent: "commercial_investigation", journeyStage: "Consideração", intentProfile: { primaryIntent: "commercial_investigation", articlePurpose: "commercial_investigation", status: "candidate", originalLabel: "Comercial" } };
  const gravado = applySerpDecisionToArticle(artigo, classificacao);
  assert.equal(gravado.mainIntent, "informational");
  assert.equal(gravado.intentProfile.primaryIntent, "informational");
  assert.equal(gravado.intentProfile.status, "confirmed");
  assert.equal(gravado.intentProfile.originalLabel, "Comercial", "o rótulo do Minerador fica como proveniência");
  assert.equal(gravado.journeyStage, "Topo de funil (SERP)");
  assert.deepEqual(applySerpDecisionToArticle(artigo, resolveArticleClassification(evidencia(null))), artigo);
});
