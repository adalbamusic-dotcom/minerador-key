import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";
import { DECLARED_PLAN_ATTACH_ACTION, planSiloArticleFormation, type DeclaredPlanFormationInput } from "../lib/arquiteto/article-formation-priority.ts";

/*
 * F4 — FORMAÇÃO COM O PLANO DECLARADO (SDD 2026-10-12 §6.2-1/2/3, D1-bis, D6).
 * Fixture espelhando a WifiConecta (§3 da SDD): Assunto 3 com principal
 * declarada SEM volume, Assunto 6 com a lista da Pesquisa por Assunto que
 * trouxe "plano vivo controle" (49.500) — que virou artigo solto antes.
 */

const siloRef = "territory:wifi";
const G = "a9d5c87b-59aa-4e49-8357-3fa893d4cd2d";
const kw = (keywordId: string, keyword: string, overrides: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => ({
  keywordId, keyword, intent: "comercial", volume: 100, kgr: null, entity: "internet residencial", problem: "contratar internet", isPublished: false, ...overrides,
});

const s3 = kw("s3", "Claro, Vivo ou TIM: qual internet residencial escolher?", { volume: null });
const s6 = kw("s6", "Combo de internet, celular e TV: quando vale a pena contratar?", { volume: null });
const p3 = kw("p3", "Claro Vivo ou TIM internet", { volume: null, entity: "operadoras" });
const p6 = kw("p6", "combo internet celular e TV", { volume: 20, entity: "combo", problem: "combo de servicos" });
const lista3 = [kw("cv", "claro ou vivo", { volume: 590, entity: "operadoras" }), kw("vc", "vivo ou claro", { volume: 590, entity: "operadoras" })];
const lista6 = [
  kw("c1", "claro internet tv e celular", { volume: 20, entity: "combo", problem: "combo de servicos" }),
  kw("c2", "combos claro movel", { volume: 20, entity: "combo", problem: "combo de servicos" }),
  kw("c3", "internet tv e celular", { volume: 20, entity: "combo", problem: "combo de servicos" }),
  kw("c4", "plano claro internet residencial e celular", { volume: 880, entity: "combo", problem: "combo de servicos" }),
  kw("c5", "plano vivo internet tv e celular", { volume: 30, entity: "combo", problem: "combo de servicos" }),
  kw("c6", "planos vivo celular internet e tv", { volume: 30, entity: "combo", problem: "combo de servicos" }),
  kw("c7", "vivo tv internet celular", { volume: 30, entity: "combo", problem: "combo de servicos" }),
  kw("pvc", "plano vivo controle", { volume: 49500, entity: "plano movel", problem: "plano de celular", intent: "transacional" }),
];
const grupoSemLista = kw("pdi", "planos de internet", { volume: 5400, entity: "planos de internet" });
const foraDoGrupo = kw("fora", "fibra óptica empresarial", { volume: 100, entity: "fibra empresarial", problem: "empresa" });

const keywords = [s3, s6, p3, p6, ...lista3, ...lista6, grupoSemLista, foraDoGrupo];
const subjects = new Map(keywords.map(keyword => [keyword.keywordId, { declared: keyword.keywordId === "s3" || keyword.keywordId === "s6", volumeValidated: false }]));
const subjectClaims = [
  { subjectKeywordId: "s3", keywordIds: lista3.map(keyword => keyword.keywordId) },
  { subjectKeywordId: "s6", keywordIds: lista6.map(keyword => keyword.keywordId) },
];
const declaredPlans = new Map<string, DeclaredPlanFormationInput>([
  ["s3", { principalKeywordId: "p3", groupId: G, order: 3, role: "Suporte" }],
  ["s6", { principalKeywordId: "p6", groupId: G, order: 6, role: "Suporte" }],
]);
const groupOfKeyword = new Map(keywords.map(keyword => [keyword.keywordId, keyword.keywordId === "fora" ? null : G]));

function formar(extra: Partial<Parameters<typeof planSiloArticleFormation>[0]> = {}) {
  return planSiloArticleFormation({
    siloRef, siloLabel: "Planos e contratação", siloSlug: "/planos-de-internet", siloTokens: new Set<string>(),
    keywords, subjects, subjectClaims, ...extra,
  });
}

test("principal declarada é a cabeceira fixa, mesmo sem volume, e o candidato já nasce com o Assunto preso", () => {
  const plano = formar({ declaredPlans, groupOfKeyword });
  const artigo3 = plano.universe.candidates.find(candidate => candidate.principalKeywordId === "p3");
  assert.ok(artigo3, "o artigo 3 nasce com a principal declarada");
  assert.equal(artigo3!.subjectKeywordId, "s3");
  assert.ok(artigo3!.keywords.some(item => item.keywordId === "cv"), "a lista do Assunto entra primeiro");
  // "claro ou vivo" (590) NÃO vira a principal: suggestPrincipal não roda.
  assert.ok(!plano.universe.candidates.some(candidate => candidate.principalKeywordId === "cv"));
  const artigo6 = plano.universe.candidates.find(candidate => candidate.principalKeywordId === "p6");
  assert.equal(artigo6?.subjectKeywordId, "s6");
  assert.deepEqual(plano.declaredPlanArticles?.map(item => [item.subjectKeywordId, item.principalKeywordId, item.order]).sort(), [["s3", "p3", 3], ["s6", "p6", 6]]);
});

test("D6 — 'plano vivo controle' nunca vira artigo solto: fica em não agrupadas do grupo, com motivo e ação", () => {
  for (const batchObjective of ["improve", "new"] as const) {
    for (const formNewFromLeftovers of [false, true]) {
      const plano = formar({ declaredPlans, groupOfKeyword, batchObjective, formNewFromLeftovers });
      assert.ok(!plano.universe.candidates.some(candidate => candidate.principalKeywordId === "pvc"), `${batchObjective}/${formNewFromLeftovers}: sem artigo de "plano vivo controle"`);
      const noArtigo6 = plano.universe.candidates.find(candidate => candidate.principalKeywordId === "p6")?.keywords.some(item => item.keywordId === "pvc");
      const diferida = plano.universe.deferredKeywords?.find(item => item.keywordId === "pvc");
      assert.ok(noArtigo6 || diferida, "ou está no artigo do Assunto, ou em não agrupadas — nunca some");
      if (diferida) {
        assert.match(diferida.reason, /fora do escopo declarado/);
        assert.ok(diferida.reason.includes(DECLARED_PLAN_ATTACH_ACTION));
      }
      // Nenhum candidato do grupo do plano sem Assunto.
      for (const candidate of plano.universe.candidates) {
        const doGrupo = candidate.keywords.every(item => groupOfKeyword.get(item.keywordId) === G);
        if (doGrupo) assert.ok(candidate.subjectKeywordId, `candidato ${candidate.candidateRef} do grupo sem Assunto`);
      }
    }
  }
});

test("teto de seis no artigo do plano; a sobra da lista do Assunto fica com o motivo, nada some", () => {
  const plano = formar({ declaredPlans, groupOfKeyword });
  const artigo6 = plano.universe.candidates.find(candidate => candidate.principalKeywordId === "p6")!;
  assert.ok(artigo6.keywords.length <= 6);
  const naMesa = new Set([
    ...plano.universe.candidates.flatMap(candidate => candidate.keywords.map(item => item.keywordId)),
    ...(plano.universe.deferredKeywords || []).map(item => item.keywordId),
    ...plano.universe.ungroupedKeywordIds,
  ]);
  for (const keyword of [...lista6, ...lista3, grupoSemLista]) assert.ok(naMesa.has(keyword.keywordId), `${keyword.keyword} sumiu`);
});

test("sustentações vêm primeiro da lista do Assunto e depois do grupo; nada de fora do grupo entra no artigo do plano", () => {
  const plano = formar({ declaredPlans, groupOfKeyword });
  const doPlano = plano.universe.candidates.filter(candidate => candidate.subjectKeywordId);
  for (const candidate of doPlano) {
    assert.ok(!candidate.keywords.some(item => item.keywordId === "fora"), "keyword de fora do grupo não entra sem decisão humana");
  }
  // A keyword do grupo sem lista ("planos de internet") ou entra num artigo do plano, ou espera no grupo com motivo.
  const pdiNoPlano = doPlano.some(candidate => candidate.keywords.some(item => item.keywordId === "pdi"));
  const pdiDiferida = plano.universe.deferredKeywords?.find(item => item.keywordId === "pdi");
  assert.ok(pdiNoPlano || /grupo do plano declarado/.test(pdiDiferida?.reason || ""));
  assert.ok(!plano.universe.candidates.some(candidate => candidate.principalKeywordId === "pdi"), "não forma artigo solto");
});

test("Assunto do plano cuja principal ainda não chegou ao Silo espera — nunca recebe principal sugerida", () => {
  const semP3 = keywords.filter(keyword => keyword.keywordId !== "p3");
  const plano = planSiloArticleFormation({
    siloRef, siloLabel: "Planos e contratação", siloSlug: "/planos-de-internet", siloTokens: new Set<string>(),
    keywords: semP3, subjects, subjectClaims, declaredPlans, groupOfKeyword,
  });
  assert.ok(!plano.universe.candidates.some(candidate => candidate.subjectKeywordId === "s3" || candidate.suggestedSubjectKeywordId === "s3"));
  assert.ok(!plano.universe.candidates.some(candidate => candidate.principalKeywordId === "cv"), "claro ou vivo não vira principal no lugar da declarada");
  assert.ok(plano.declaredPlanNotices?.some(notice => /aguarda a principal declarada/.test(notice)));
});

test("sem plano, a formação é idêntica à de antes (marcas sem plano: Care Glow, AdalbaPro)", () => {
  const antes = formar();
  const vazio = formar({ declaredPlans: new Map(), groupOfKeyword: new Map() });
  const soGrupo = formar({ groupOfKeyword });
  const resumo = (plano: ReturnType<typeof formar>) => JSON.stringify({
    candidates: plano.universe.candidates.map(candidate => [candidate.candidateRef, candidate.principalKeywordId, candidate.keywords.map(item => `${item.keywordId}:${item.role}`), candidate.subjectKeywordId ?? null, candidate.suggestedSubjectKeywordId ?? null]),
    deferred: plano.universe.deferredKeywords,
    anchors: plano.anchors,
    leftover: plano.leftoverKeywordIds,
  });
  assert.equal(resumo(vazio), resumo(antes));
  // Grupo sem plano não muda nada: o grupo é organização, não significado.
  assert.equal(resumo(soGrupo), resumo(antes));
});

test("estrutural: o artigo solto do passo 4 não nasce de sustentação de Assunto com plano", () => {
  const fonte = readFileSync(new URL("../lib/arquiteto/article-formation-priority.ts", import.meta.url), "utf8");
  // A sobra do plano sai de livresDaReserva ANTES dos núcleos e dos excedentes.
  const corte = fonte.indexOf("const foraDoPlano = livresDaReserva");
  assert.ok(corte > 0);
  assert.ok(corte < fonte.indexOf("const excedentes: Array<"), "o corte vem antes dos excedentes");
  assert.ok(corte < fonte.indexOf("const nucleos = particao.nuclei"), "o corte vem antes dos núcleos");
});
