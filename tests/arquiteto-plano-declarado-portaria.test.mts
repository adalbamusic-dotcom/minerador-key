import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";
import { planSiloArticleFormation, type DeclaredPlanFormationInput } from "../lib/arquiteto/article-formation-priority.ts";
import { buildArticleFormationConfirmationPlan, readyConclusionSubset, validateFormationConclusion } from "../lib/arquiteto/article-formation-confirmation.ts";
import { DECLARED_PLAN_PENDING_REASON, DECLARED_PRINCIPAL_IMPROVEMENT_REASON, planArticleImprovements, type ImprovementKeyword, type ImprovementTarget } from "../lib/arquiteto/article-improvement.ts";
import { resolveKeywordDnaSignals } from "../lib/arquiteto/keyword-dna-signals.ts";
import { applyDeclaredPlanToArticleDna, declaredPlanAppliedTo, declaredPlanForGroup, declaredPlanFormationInputs, declaredPlanSubjectList } from "../lib/arquiteto/declared-plan-formation.ts";
import type { ArticleDNA } from "../lib/arquiteto/contracts.ts";

/*
 * F4 — PORTARIA DECLARED_PLAN_PRESERVED, PAPEL E PROMESSA DO PLANO, MELHORIA SEM
 * TROCAR A PRINCIPAL (SDD 2026-10-12 §6.2-4/5/7; D1-bis, D8, D11). Fixtures puras.
 */

const siloRef = "territory:wifi";
const G = "a9d5c87b-59aa-4e49-8357-3fa893d4cd2d";
const kw = (keywordId: string, keyword: string, overrides: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => ({
  keywordId, keyword, intent: "comercial", volume: 100, kgr: null, entity: "operadoras", problem: "escolher operadora", isPublished: false, ...overrides,
});
const keywords = [
  kw("s3", "Claro, Vivo ou TIM: qual internet residencial escolher?", { volume: null }),
  kw("p3", "Claro Vivo ou TIM internet", { volume: null }),
  kw("cv", "claro ou vivo", { volume: 590 }),
  kw("vc", "vivo ou claro", { volume: 590 }),
];
const subjects = new Map(keywords.map(keyword => [keyword.keywordId, { declared: keyword.keywordId === "s3", volumeValidated: false }]));
const declaredPlans = new Map<string, DeclaredPlanFormationInput>([["s3", { principalKeywordId: "p3", groupId: G, order: 3, role: "Suporte" }]]);
const groupOfKeyword = new Map(keywords.map(keyword => [keyword.keywordId, G]));

function portaria(trocarPrincipal = false) {
  const plano = planSiloArticleFormation({ siloRef, siloLabel: "Planos", siloSlug: "/planos-de-internet", siloTokens: new Set<string>(), keywords, subjects, subjectClaims: [{ subjectKeywordId: "s3", keywordIds: ["cv", "vc"] }], declaredPlans, groupOfKeyword });
  const universe = structuredClone(plano.universe);
  if (trocarPrincipal) {
    const candidato = universe.candidates.find(candidate => candidate.subjectKeywordId === "s3")!;
    candidato.principalKeywordId = "cv";
    candidato.keywords = candidato.keywords.map(item => ({ ...item, role: item.keywordId === "cv" ? "principal" : "secundaria" }));
  }
  const confirmation = buildArticleFormationConfirmationPlan({ universes: [universe] });
  const input = {
    universes: [universe], plan: confirmation, keywordSiloRef: new Map(keywords.map(keyword => [keyword.keywordId, siloRef])), ceiling: 6,
    serpGates: new Map(confirmation.approved.map(entry => [entry.candidateRef, { state: "current_compatible", blocksConclusion: false, requiresHumanDecision: false, reason: "" }])),
    subjectLabels: new Map([["s3", "Claro, Vivo ou TIM"]]),
    declaredPlans: new Map([["s3", { principalKeywordId: "p3", subjectListKeywordIds: ["cv", "vc"], principalLabel: "Claro Vivo ou TIM internet" }]]),
  };
  return { verdict: validateFormationConclusion(input), subset: readyConclusionSubset(input), confirmation };
}

test("portaria: o artigo do plano com a principal declarada e a lista do Assunto passa em DECLARED_PLAN_PRESERVED", () => {
  const { verdict, confirmation } = portaria();
  assert.ok(confirmation.approved.some(entry => entry.subjectKeywordId === "s3" && entry.principalKeywordId === "p3"));
  const gate = verdict.gates.find(item => item.code === "DECLARED_PLAN_PRESERVED");
  assert.ok(gate, "a portaria mostra o contrato quando há artigo de plano no lote");
  assert.equal(gate!.ok, true, gate!.detail);
});

test("portaria: trocar a principal declarada barra o lote (estrutural, sem 'refazer mesmo assim') e tira o artigo dos prontos", () => {
  const { verdict, subset } = portaria(true);
  const gate = verdict.gates.find(item => item.code === "DECLARED_PLAN_PRESERVED")!;
  assert.equal(gate.ok, false);
  assert.match(gate.detail, /principal declarada/);
  assert.equal(verdict.ok, false);
  assert.ok(subset.heldOut.some(item => item.reasons.some(reason => /principal declarada/.test(reason))));
});

test("portaria: sem plano no lote, o contrato nem aparece (marcas sem plano ficam como antes)", () => {
  const plano = planSiloArticleFormation({ siloRef, siloLabel: "Planos", siloSlug: "/planos-de-internet", siloTokens: new Set<string>(), keywords, subjects, subjectClaims: [{ subjectKeywordId: "s3", keywordIds: ["cv", "vc"] }] });
  const confirmation = buildArticleFormationConfirmationPlan({ universes: [plano.universe] });
  const verdict = validateFormationConclusion({ universes: [plano.universe], plan: confirmation, keywordSiloRef: new Map(), ceiling: 6, serpGates: new Map() });
  assert.ok(!verdict.gates.some(item => item.code === "DECLARED_PLAN_PRESERVED"));
});

const article = (overrides: Partial<ArticleDNA> = {}) => ({ principalKeywordId: "p3", hierarchy: "Suporte", promise: "Cobrir com clareza o tema “Claro Vivo ou TIM internet”.", ...overrides }) as unknown as ArticleDNA;
const standing = { keywordId: "s3", plan: { groupId: G, planVersion: 1, order: 1, role: "Pilar" as const, scope: "Explicar o que comparar antes da contratação.", declaredPrincipal: { keywordId: "p3", phrase: "Claro Vivo ou TIM internet" } } };

test("papel e promessa: o papel declarado vira a hierarquia e a descrição vira a promessa; principal trocada é recusa", () => {
  assert.deepEqual(declaredPlanForGroup(standing), { role: "Pilar", scope: "Explicar o que comparar antes da contratação." });
  assert.equal(declaredPlanForGroup({ plan: null }), undefined);
  const aplicado = applyDeclaredPlanToArticleDna(article(), standing);
  assert.ok(aplicado.ok && aplicado.changed);
  if (aplicado.ok) {
    assert.equal(aplicado.value.hierarchy, "Pilar");
    assert.equal(aplicado.value.promise, "Explicar o que comparar antes da contratação.");
    assert.equal(declaredPlanAppliedTo(aplicado.value, standing), true);
  }
  assert.equal(declaredPlanAppliedTo(article(), standing), false, "D8: a moldura genérica pede versão nova");
  const trocado = applyDeclaredPlanToArticleDna(article({ principalKeywordId: "cv" }), standing);
  assert.equal(trocado.ok, false);
  assert.ok(applyDeclaredPlanToArticleDna(article(), { keywordId: "x", plan: null }).ok);
});

test("adapter: `deterministicArticleDnaPayload` usa o papel e o escopo do grupo quando há plano (estrutural)", () => {
  const fonte = readFileSync(new URL("../lib/arquiteto/adapters.ts", import.meta.url), "utf8");
  assert.match(fonte, /hierarchy: group\.declaredPlan\?\.role \?\? group\.suggestedHierarchy/);
  assert.match(fonte, /promise: group\.declaredPlan\?\.scope \|\| text\(semantic\.promessa/);
  // 2026-10-16 · o slug declarado no Minerador vale para o artigo NOVO (sem âncora publicada).
  assert.match(fonte, /const suggestedSlug = \(!group\.publishedAnchorId && group\.declaredPlan\?\.slug\) \|\| principal\.slug_sugerido/);
});

test("slug declarado no plano (Minerador, 2026-10-16): a formação, o grupo e o ArticleDNA do artigo NOVO usam o slug declarado; o publicado nunca muda; plano sem slug fica como antes", () => {
  const comSlug = { ...standing, plan: { ...standing.plan, slug: "claro-vivo-tim-internet-residencial" } };
  assert.deepEqual(declaredPlanForGroup(comSlug), { role: "Pilar", scope: "Explicar o que comparar antes da contratação.", slug: "claro-vivo-tim-internet-residencial" });
  // O ArticleDNA vigente (artigo novo): o slug declarado vira o suggestedSlug, com papel e promessa.
  const novo = applyDeclaredPlanToArticleDna(article({ suggestedSlug: "claro-vivo-ou-tim-internet" }), comSlug);
  assert.ok(novo.ok && novo.changed);
  if (novo.ok) {
    assert.equal(novo.value.suggestedSlug, "claro-vivo-tim-internet-residencial");
    assert.equal(declaredPlanAppliedTo(novo.value, comSlug), true);
  }
  assert.equal(declaredPlanAppliedTo(article({ hierarchy: "Pilar", promise: "Explicar o que comparar antes da contratação.", suggestedSlug: "outro" }), comSlug), false, "slug diferente do declarado pede versão nova");
  // Publicado: URL, slug e canonical protegidos (AGENTS §11) — o slug declarado não entra.
  const publicado = article({ hierarchy: "Pilar", promise: "Explicar o que comparar antes da contratação.", suggestedSlug: "claro-ou-vivo", publishedIdentityRef: { slug: "claro-ou-vivo" } as never });
  const aplicadoNoPublicado = applyDeclaredPlanToArticleDna(publicado, comSlug);
  assert.ok(aplicadoNoPublicado.ok && !aplicadoNoPublicado.changed);
  if (aplicadoNoPublicado.ok) assert.equal(aplicadoNoPublicado.value.suggestedSlug, "claro-ou-vivo");
  assert.equal(declaredPlanAppliedTo(publicado, comSlug), true);
  // Plano sem slug: nada muda no slug (o de antes, pela principal).
  const semSlug = applyDeclaredPlanToArticleDna(article({ suggestedSlug: "claro-vivo-ou-tim-internet" }), standing);
  assert.ok(semSlug.ok && semSlug.value.suggestedSlug === "claro-vivo-ou-tim-internet");
  // A formação: o candidato do artigo do plano nasce com o slug declarado (a mesma entrada `declaredPlans`).
  const base = { declared: true, received: true, approvedPackageRef: { version: 1, contentHash: "sha256:x" }, brandId: "b1" };
  const entradas = declaredPlanFormationInputs({ standings: [{ ...base, keywordId: "s3", plan: { ...comSlug.plan, order: 3, role: "Suporte" as const } }] as never, brandId: "b1" });
  assert.equal(entradas.get("s3")?.slug, "claro-vivo-tim-internet-residencial");
  const formacao = planSiloArticleFormation({ siloRef, siloLabel: "Planos", siloSlug: "/planos-de-internet", siloTokens: new Set<string>(), keywords, subjects, subjectClaims: [{ subjectKeywordId: "s3", keywordIds: ["cv", "vc"] }], declaredPlans: new Map([["s3", { ...declaredPlans.get("s3")!, slug: "claro-vivo-tim-internet-residencial" }]]), groupOfKeyword });
  assert.equal(formacao.universe.candidates.find(candidate => candidate.subjectKeywordId === "s3")?.suggestedSlug, "claro-vivo-tim-internet-residencial");
  const semSlugNaFormacao = planSiloArticleFormation({ siloRef, siloLabel: "Planos", siloSlug: "/planos-de-internet", siloTokens: new Set<string>(), keywords, subjects, subjectClaims: [{ subjectKeywordId: "s3", keywordIds: ["cv", "vc"] }], declaredPlans, groupOfKeyword });
  assert.notEqual(semSlugNaFormacao.universe.candidates.find(candidate => candidate.subjectKeywordId === "s3")?.suggestedSlug, "claro-vivo-tim-internet-residencial", "sem slug declarado, o slug sai da principal como sempre");
});

test("leituras únicas: só Assunto declarado, recebido, com pacote e desta marca entra no plano; a lista é a da Pesquisa por Assunto", () => {
  const base = { declared: true, received: true, approvedPackageRef: { version: 1, contentHash: "sha256:x" }, brandId: "b1", plan: standing.plan };
  const inputs = declaredPlanFormationInputs({ standings: [
    { ...base, keywordId: "s3" },
    { ...base, keywordId: "outra", brandId: "b2" },
    { ...base, keywordId: "sempacote", approvedPackageRef: null },
    { ...base, keywordId: "semplano", plan: null },
  ] as never, brandId: "b1" });
  assert.deepEqual([...inputs.keys()], ["s3"]);
  assert.deepEqual(inputs.get("s3"), { principalKeywordId: "p3", groupId: G, order: 1, role: "Pilar" });
  const lista = declaredPlanSubjectList<{ keywordId: string; signals: ("subject_discovery" | "subject_phrase_terms" | "central_entity")[] }>([{ keywordId: "a", signals: ["subject_discovery"] }, { keywordId: "b", signals: ["subject_phrase_terms", "central_entity"] }]);
  assert.deepEqual(lista.map(item => item.keywordId), ["a"]);
});

/* ------------------------------------------------------------- melhoria */

const dna = (id: string) => resolveKeywordDnaSignals({ keywordId: id, text: "claro ou vivo", semantic: { entidade_central: "operadoras", problema_percebido: "escolher operadora", resultado_desejado: "contratar internet", intencao_principal: "Comercial" } });
const term = (id: string, overrides: Partial<ImprovementKeyword> = {}): ImprovementKeyword => ({ id, keyword: `claro ou vivo ${id}`, volume: 590, volumeValidated: true, signals: dna(id), ownerId: null, published: false, territoryRef: siloRef, external: false, ...overrides });
const alvo = (overrides: Partial<ImprovementTarget> = {}): ImprovementTarget => ({ id: "s3", kind: "subject", theme: "Claro, Vivo ou TIM: qual internet residencial escolher?", note: null, primaryId: "cv", post: "free", memberIds: ["cv", "vc"], territoryRef: siloRef, slug: "claro-ou-vivo", url: null, canonical: null, signals: dna("s3"), ...overrides });
const melhor = term("melhor", { keyword: "claro ou vivo qual melhor", volume: 9000 });
const evidencia = (keywordId: string) => ({ targetId: "s3", keywordId, complete: true, sharedPages: 5, contradiction: false, anchorConclusive: true });

test("melhoria: com principal declarada, needsPrimary é falso — a declarada (sem volume) assume e a antiga fica secundária", () => {
  const keywords = [term("cv"), term("vc"), term("p3", { keyword: "Claro Vivo ou TIM internet", volume: null, volumeValidated: false }), melhor];
  const [comPlano] = planArticleImprovements({ targets: [alvo({ declaredPrincipalId: "p3" })], keywords, evidence: [evidencia("melhor"), evidencia("cv"), evidencia("vc")] });
  assert.equal(comPlano.principalId, "p3");
  assert.ok(comPlano.memberIds.includes("p3") && comPlano.memberIds.includes("cv"));
  assert.ok(comPlano.memberIds.length <= 6);
  assert.equal(comPlano.status, "ready");
  assert.ok(comPlano.reasons.some(reason => reason.startsWith(DECLARED_PRINCIPAL_IMPROVEMENT_REASON)));
  // Sem plano, a regra de antes troca pela de maior volume — é isso que o plano impede.
  const [semPlano] = planArticleImprovements({ targets: [alvo()], keywords, evidence: [evidencia("melhor"), evidencia("cv"), evidencia("vc")] });
  assert.notEqual(semPlano.principalId, "p3");
  // A principal declarada de um Assunto nunca reforça outro alvo.
  const outro = alvo({ id: "s9", theme: "claro ou vivo empresas", primaryId: "vc", memberIds: ["vc"] });
  const resultados = planArticleImprovements({ targets: [alvo({ declaredPrincipalId: "p3", memberIds: ["cv"] }), outro], keywords, evidence: [evidencia("p3"), { ...evidencia("p3"), targetId: "s9" }] });
  assert.ok(!resultados[1].memberIds.includes("p3"));
});

test("melhoria: principal declarada igual à atual e plano ainda não aplicado ao DNA = versão nova com promessa e papel (D8)", () => {
  const keywords = [term("p1", { keyword: "melhor plano de internet residencial", volume: 260 }), melhor];
  const [proposta] = planArticleImprovements({ targets: [alvo({ id: "s1", primaryId: "p1", memberIds: ["p1"], declaredPrincipalId: "p1", declaredPlanPending: true })], keywords, evidence: [] });
  assert.equal(proposta.principalId, "p1");
  assert.equal(proposta.status, "ready");
  assert.ok(proposta.reasons.includes(DECLARED_PLAN_PENDING_REASON));
  const [jaAplicado] = planArticleImprovements({ targets: [alvo({ id: "s1", primaryId: "p1", memberIds: ["p1"], declaredPrincipalId: "p1" })], keywords, evidence: [] });
  assert.notEqual(jaAplicado.status, "ready", "nada mudou: sem versão nova");
});

test("servidor da melhoria (estrutural): a keyword nova do Assunto nasce ligada a ele, o plano entra no DNA e na impressão digital", () => {
  const fonte = readFileSync(new URL("../lib/server/arquiteto-article-improvement.ts", import.meta.url), "utf8");
  // F4 (ajuste declarado 2026-10-14): a keyword nova vira sugestão ao Minerador, ligada ao Assunto; o import (que liga ao grupo dele) é do Minerador.
  const sugestao = readFileSync(new URL("../lib/arquiteto/article-improvement-minerador.ts", import.meta.url), "utf8");
  assert.match(sugestao, /subjectKeywordId: target\.kind === "subject" \? target\.id : null/);
  assert.doesNotMatch(sugestao, /subjectKeywordId: null, subjectPhrase/);
  assert.match(fonte, /applyDeclaredPlanToArticleDna\(payload/);
  // 2026-10-13 · só a principal TRAVADA é fixa; a livre é a principal atual e pode ser trocada.
  assert.match(fonte, /declaredPrincipalId: fixa\.keywordId/);
  assert.match(fonte, /const fixa = lockedPlanPrincipal\(standing\);/);
  // 2026-10-15 · a principal atual virou variável: a Livre com volume definido fica fixa (regra do dono R2, também no motor).
  assert.match(fonte, /const principalAtual = article\?\.payload\.principalKeywordId \?\? livre\?\.keywordId \?\? null;/);
  assert.match(fonte, /primaryId: principalAtual,/);
  assert.match(fonte, /livreComVolume \? \{ declaredPrincipalId: livreComVolume \}/);
  assert.match(fonte, /declaredPrincipalId: target\.declaredPrincipalId/);
});
