import assert from "node:assert/strict";
import test from "node:test";
import type { ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";
import { planSiloArticleFormation, type DeclaredPlanFormationInput } from "../lib/arquiteto/article-formation-priority.ts";
import { declaredPlanAppliedTo, declaredPlanFormationInputs, declaredPlanGateInputs } from "../lib/arquiteto/declared-plan-formation.ts";
import { declaredPlanArticleContradictions } from "../lib/arquiteto/declared-plan-rework.ts";
import { articleDeclaredPlanSeals } from "../lib/arquiteto/declared-plan-seals.ts";
import { freePlanPrincipal, lockedPlanPrincipal, readArchitectSubjectStanding, subjectMayBePrincipal, type ArchitectSubjectStanding } from "../lib/arquiteto/declared-subject.ts";
import { buildArchitectureWorkingProposal, resolveKeywordDnaSignals } from "../lib/arquiteto/architecture-working-proposal.ts";
import type { ArchitectureAnalysis, ClusterAnalysis } from "../lib/arquiteto/architecture-analysis.ts";
import { ATOR, MARCA, VOLUME_VALIDADO, linhaDaMesa } from "./arquiteto-assunto-fixtures.mts";

/*
 * O ARQUITETO OBEDECE À TRAVA (SDD `sdd-cadastro-assunto-na-keyword-2026-10-13.md`
 * §3.3 e §3.5; ADR-022 D1-ter). Fixture: o Silo 2 da WifiConecta — o Assunto
 * mora na keyword; "Wi-Fi lento" tem volume (travada), "internet fibra óptica"
 * não tem (livre). Sem rede, sem provider, sem custo.
 */

const G = "22222222-3333-4444-8555-666666666666";
const TITULO_9 = "Internet fibra óptica ou internet comum: qual a diferença e qual escolher?";
const TITULO_11 = "Wi-Fi lento em casa: 10 causas comuns e como melhorar a conexão";

function cadastro(id: string, keyword: string, titulo: string, order: number, role: "Pilar" | "Suporte", extra: Record<string, unknown> = {}, lock?: "locked" | "free") {
  return {
    dna_origem: "logico_deterministico",
    ...extra,
    keyword_subject: {
      declared: true, note: null, destinationUrl: null, destinationCheck: null,
      entry: { title: titulo, source: "cadastro" },
      plan: { groupId: G, planVersion: 1, order, role, scope: `Escopo do artigo ${order}.`, declaredPrincipal: { keywordId: id, phrase: keyword }, ...(lock ? { lock } : {}) },
    },
    keyword_subject_actor: ATOR,
    keyword_subject_at: "2026-10-13T10:00:00+00:00",
    keyword_subject_origin: "import",
    keyword_declared_principal: { subjectKeywordId: id, groupId: G, planVersion: 1 },
  };
}

const fibra = () => readArchitectSubjectStanding(linhaDaMesa({ id: "k9", keyword: "internet fibra óptica", semantic: cadastro("k9", "internet fibra óptica", TITULO_9, 9, "Pilar") }));
const wifi = () => readArchitectSubjectStanding(linhaDaMesa({ id: "k11", keyword: "wi-fi lento", semantic: cadastro("k11", "wi-fi lento", TITULO_11, 11, "Suporte", VOLUME_VALIDADO) }));

test("standing: a frase do Assunto é o título; a keyword que o carrega não sai da formação; trava pelo volume", () => {
  const livre = fibra();
  assert.equal(livre.phrase, TITULO_9, "ArticleDNA.subject.phrase = o título cadastrado");
  assert.equal(livre.carriesSubject, true);
  assert.equal(livre.heldOutOfFormation, false, "sem volume, mas a keyword é membro do próprio artigo");
  assert.equal(livre.planLock?.state, "free");
  assert.equal(lockedPlanPrincipal(livre), null);
  assert.equal(freePlanPrincipal(livre)?.keywordId, "k9");
  assert.equal(subjectMayBePrincipal(livre), true, "Q7 revista: a keyword que carrega o Assunto pode ser a principal sem volume");
  const travada = wifi();
  assert.equal(travada.planLock?.state, "locked");
  assert.equal(travada.planLock?.origin, "volume");
  assert.equal(lockedPlanPrincipal(travada)?.keywordId, "k11");
  // Trava manual vence o volume.
  const manual = readArchitectSubjectStanding(linhaDaMesa({ id: "k9", keyword: "internet fibra óptica", semantic: cadastro("k9", "internet fibra óptica", TITULO_9, 9, "Pilar", {}, "locked") }));
  assert.equal(manual.planLock?.state, "locked");
  assert.equal(manual.planLock?.origin, "manual");
  // Assunto antigo (frase própria) sem volume continua fora da formação e sem poder ser principal.
  const antigo = readArchitectSubjectStanding(linhaDaMesa({ id: "s1", keyword: "Como escolher o melhor plano", semantic: { keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null } } }));
  assert.equal(antigo.heldOutOfFormation, true);
  assert.equal(subjectMayBePrincipal(antigo), false);
  assert.equal(antigo.phrase, "Como escolher o melhor plano");
});

test("entradas da formação e da portaria: só a TRAVADA é fixa; a livre vai como livre", () => {
  const standings = [fibra(), wifi()].map(standing => ({ ...standing, brandId: MARCA }));
  const formacao = declaredPlanFormationInputs({ standings, brandId: MARCA });
  assert.deepEqual(formacao.get("k9"), { principalKeywordId: null, freePrincipalKeywordId: "k9", groupId: G, order: 9, role: "Pilar" });
  assert.deepEqual(formacao.get("k11"), { principalKeywordId: "k11", groupId: G, order: 11, role: "Suporte" });
  const portaria = declaredPlanGateInputs({ standings, brandId: MARCA });
  assert.equal(portaria.get("k9")?.principalKeywordId, null, "a livre não é conferida como principal fixa");
  assert.equal(portaria.get("k11")?.principalKeywordId, "k11");
});

const kw = (keywordId: string, keyword: string, overrides: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => ({
  keywordId, keyword, intent: "informacional", volume: 100, kgr: null, entity: "fibra optica", problem: "escolher internet", isPublished: false, ...overrides,
});

function formar(plans: Map<string, DeclaredPlanFormationInput>, listaFibra = ["fo", "if"]) {
  const k9 = kw("k9", "internet fibra óptica", { volume: null });
  const k11 = kw("k11", "wi-fi lento", { volume: 1900, entity: "wifi", problem: "wifi lento" });
  const fo = kw("fo", "fibra optica", { volume: 8100 });
  const inf = kw("if", "internet de fibra", { volume: 2400 });
  const wl = kw("wl", "wifi lento como resolver", { volume: 320, entity: "wifi", problem: "wifi lento" });
  const keywords = [k9, k11, fo, inf, wl];
  const subjects = new Map(keywords.map(keyword => [keyword.keywordId, { declared: keyword.keywordId === "k9" || keyword.keywordId === "k11", volumeValidated: keyword.keywordId !== "k9" }]));
  return planSiloArticleFormation({
    siloRef: "territory:wifi", siloLabel: "Wi-Fi e fibra óptica", siloSlug: "/wifi-e-fibra", siloTokens: new Set<string>(),
    keywords, subjects,
    subjectClaims: [{ subjectKeywordId: "k9", keywordIds: listaFibra }, { subjectKeywordId: "k11", keywordIds: ["wl"] }],
    declaredPlans: plans,
    groupOfKeyword: new Map(keywords.map(keyword => [keyword.keywordId, G])),
  });
}

test("formação: a LIVRE é trocada por uma sustentação com volume (o Assunto fica preso); a TRAVADA é fixa", () => {
  const plans = new Map<string, DeclaredPlanFormationInput>([
    ["k9", { principalKeywordId: null, freePrincipalKeywordId: "k9", groupId: G, order: 9, role: "Pilar" }],
    ["k11", { principalKeywordId: "k11", groupId: G, order: 11, role: "Suporte" }],
  ]);
  const plano = formar(plans);
  const artigo9 = plano.universe.candidates.find(candidate => candidate.subjectKeywordId === "k9");
  assert.ok(artigo9, "o artigo do Assunto 9 existe");
  assert.notEqual(artigo9!.principalKeywordId, "k9", "a keyword livre sem volume deu lugar a uma com volume");
  assert.ok(["fo", "if"].includes(artigo9!.principalKeywordId));
  assert.ok(!artigo9!.keywords.some(item => item.keywordId === "k9"), "a keyword que carrega o Assunto fica como tronco, fora das seis");
  const artigo11 = plano.universe.candidates.find(candidate => candidate.subjectKeywordId === "k11");
  assert.equal(artigo11?.principalKeywordId, "k11", "travada: cabeceira fixa");
  const doPlano = new Map(plano.declaredPlanArticles?.map(item => [item.subjectKeywordId, item]));
  assert.equal(doPlano.get("k9")?.role, "Pilar", "o papel e a ordem continuam do plano");
  assert.equal(doPlano.get("k9")?.order, 9);
  assert.equal(doPlano.get("k11")?.principalKeywordId, "k11");
});

test("formação: a LIVRE sem candidata melhor continua principal (o Assunto nunca fica sem artigo)", () => {
  const plans = new Map<string, DeclaredPlanFormationInput>([["k9", { principalKeywordId: null, freePrincipalKeywordId: "k9", groupId: G, order: 9, role: "Pilar" }]]);
  const plano = formar(plans, []);
  const artigo9 = plano.universe.candidates.find(candidate => candidate.subjectKeywordId === "k9");
  assert.equal(artigo9?.principalKeywordId, "k9");
});

test("melhoria/portaria/guarda: livre trocada não é contradição; travada é", () => {
  const livre = fibra();
  const travada = wifi();
  assert.equal(declaredPlanAppliedTo({ hierarchy: "Pilar", promise: "Escopo do artigo 9.", principalKeywordId: "fo" }, livre), true, "livre trocada: o plano continua aplicado");
  assert.equal(declaredPlanAppliedTo({ hierarchy: "Suporte", promise: "Escopo do artigo 11.", principalKeywordId: "outra" }, travada), false);
  assert.deepEqual(declaredPlanArticleContradictions({ plan: livre.plan, next: { principalKeywordId: "fo", hierarchy: "Pilar" }, previous: null, principalLocked: false }), []);
  assert.equal(declaredPlanArticleContradictions({ plan: travada.plan, next: { principalKeywordId: "outra", hierarchy: "Suporte" }, previous: null, principalLocked: true }).length, 1);
  assert.equal(declaredPlanArticleContradictions({ plan: livre.plan, next: { principalKeywordId: "fo", hierarchy: "Suporte" }, previous: null, principalLocked: false }).length, 1, "o papel continua conferido mesmo com a principal livre");
});

test("selos: 'Keyword livre' e 'Livre · principal trocada' no lugar de 'Principal ≠ declarada'", () => {
  const standings = new Map<string, ArchitectSubjectStanding>([["k9", fibra()], ["k11", wifi()]]);
  const naPropria = articleDeclaredPlanSeals({ subjectKeywordId: "k9", principalKeywordId: "k9", standingOf: id => standings.get(id), groupHasPlan: true });
  assert.ok(naPropria.some(selo => selo.kind === "free_principal" && selo.label === "Keyword livre"));
  const trocada = articleDeclaredPlanSeals({ subjectKeywordId: "k9", principalKeywordId: "fo", standingOf: id => standings.get(id), groupHasPlan: true });
  assert.ok(trocada.some(selo => selo.kind === "free_principal_replaced"));
  assert.ok(!trocada.some(selo => selo.kind === "principal_diverges"));
  const fixa = articleDeclaredPlanSeals({ subjectKeywordId: "k11", principalKeywordId: "k11", standingOf: id => standings.get(id), groupHasPlan: true });
  assert.ok(fixa.some(selo => selo.kind === "declared_principal" && /Travada · pelo volume medido/.test(selo.title)));
});

test("Processar arquitetura: keyword de grupo com plano segue o plano; o léxico não a espalha nem a usa de semente", () => {
  const ids = ["k9", "k10", "x1"];
  const sinais = ids.map(keywordId => resolveKeywordDnaSignals({ keywordId, text: keywordId, semantic: {} }));
  const cluster = { clusterRef: "c1", label: "fibra", memberKeywordIds: ids, headKeywordId: "k9", ambiguousHeadKeywordIds: [], destination: "new_silo_candidate", suggestedTerritoryRef: null, suggestedTerritoryLabel: null, alternativeTerritoryRefs: [], confidence: "alta", reason: "grupo coeso" } as unknown as ClusterAnalysis;
  const analise: ArchitectureAnalysis = { clusters: [cluster], summary: { keywords: 3, clusters: 1, strengthening: 0, newSilos: 1, insufficient: 0, ambiguous: 0, confidence: "alta" }, narrative: [], baseHash: "base" };
  const base = { analysis: analise, existingSilos: [], keywords: sinais, slugOf: (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-") };
  const antes = buildArchitectureWorkingProposal(base);
  assert.ok(antes.assignments.some(item => item.keywordId === "k9" && item.siloKey === "proposed:fibra"), "sem plano: o léxico decide, como antes");
  const depois = buildArchitectureWorkingProposal({ ...base, declaredPlanGroups: [{ groupId: G, label: "Azul", siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra", territoryRef: null, keywordIds: ["k9", "k10"] }] });
  const destino = (keywordId: string) => depois.assignments.find(item => item.keywordId === keywordId);
  assert.equal(destino("k9")?.siloKey, "proposed:wifi-e-fibra");
  assert.equal(destino("k10")?.siloKey, "proposed:wifi-e-fibra");
  assert.match(destino("k9")?.reason || "", /Segue o plano declarado do grupo Azul/);
  assert.notEqual(destino("x1")?.siloKey, "proposed:wifi-e-fibra", "a keyword fora do grupo segue o léxico");
  assert.ok(!depois.silos.some(silo => silo.seedKeywordId === "k9" && silo.key !== "proposed:wifi-e-fibra"), "keyword do plano não é semente de outro Silo");
  assert.equal(depois.counters.RESOLVED_KEYWORDS, 3, "nenhuma keyword some");
  // O Silo já ligado ao grupo recebe as keywords do plano.
  const ligado = buildArchitectureWorkingProposal({ ...base, existingSilos: [{ territoryRef: "territory:wifi", name: "Wi-Fi", centralEntity: "wifi", slug: "wifi" }], declaredPlanGroups: [{ groupId: G, label: "Azul", siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra", territoryRef: "territory:wifi", keywordIds: ["k9", "k10"] }] });
  assert.equal(ligado.assignments.find(item => item.keywordId === "k9")?.siloKey, "territory:wifi");
});
