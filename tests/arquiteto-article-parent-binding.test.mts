import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PARENT_BINDING_LABELS,
  assertSingleParent,
  resolveParentBinding,
} from "../lib/arquiteto/article-parent-binding.ts";
import {
  buildArticleFormationUniverse,
  siloThemeTokens,
  type ArticleFormationKeyword,
} from "../lib/arquiteto/article-formation.ts";

const SILO_A = "territory:11111111-1111-4111-8111-111111111111";
const SILO_B = "territory:22222222-2222-4222-8222-222222222222";

const kw = (id: string, keyword: string, overrides: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => ({
  keywordId: id, keyword, intent: "informacional", volume: 100, kgr: null,
  entity: null, problem: null, isPublished: false, ...overrides,
});

/* ---------------- §3/§4 o pai é declarado, não inferido ------------------ */

test("pai declarado e keywords de acordo é o contrato normal", () => {
  const verdict = resolveParentBinding({
    ref: "a1",
    declaredParent: SILO_A,
    keywordIds: ["k1", "k2"],
    parentByKeywordId: new Map([["k1", SILO_A], ["k2", SILO_A]]),
  });
  assert.equal(verdict.code, "PARENT_DECLARED");
  assert.equal(verdict.effectiveParent, SILO_A);
});

test("§6 sem declaração, o consenso resolve como LEGADO — não como contrato", () => {
  const verdict = resolveParentBinding({
    ref: "a1",
    declaredParent: null,
    keywordIds: ["k1", "k2"],
    parentByKeywordId: new Map([["k1", SILO_A], ["k2", SILO_A]]),
  });
  assert.equal(verdict.code, "PARENT_INFERRED_LEGACY");
  assert.equal(verdict.effectiveParent, SILO_A);
  assert.match(verdict.reason, /não declara/);
});

test("§5 divergência vira CONFLITO e o artigo NÃO é movido", () => {
  const verdict = resolveParentBinding({
    ref: "a1",
    declaredParent: SILO_A,
    keywordIds: ["k1", "k2"],
    parentByKeywordId: new Map([["k1", SILO_A], ["k2", SILO_B]]),
  });
  assert.equal(verdict.code, "PARENT_CONFLICT");
  // O pai efetivo continua o declarado: a keyword não reescreve o artigo.
  assert.equal(verdict.effectiveParent, SILO_A);
});

test("sem declaração e sem consenso, nada é escolhido no empate", () => {
  const verdict = resolveParentBinding({
    ref: "a1",
    declaredParent: null,
    keywordIds: ["k1", "k2"],
    parentByKeywordId: new Map([["k1", SILO_A], ["k2", SILO_B]]),
  });
  assert.equal(verdict.code, "PARENT_UNRESOLVED");
  assert.equal(verdict.effectiveParent, null);
  assert.equal(Object.keys(PARENT_BINDING_LABELS).length, 4);
});

/* -------------------- §18 SMOKE A — positivo e negativo ------------------ */

test("SMOKE A positivo: Silo A com duas keywords do Silo A é aceito", () => {
  const resultado = assertSingleParent({
    candidateRef: "c1",
    parentSiloRef: SILO_A,
    keywordIds: ["k1", "k2"],
    parentByKeywordId: new Map([["k1", SILO_A], ["k2", SILO_A]]),
  });
  assert.equal(resultado.ok, true);
});

test("SMOKE A negativo: keyword do Silo B na mesma formação é RECUSADA", () => {
  const resultado = assertSingleParent({
    candidateRef: "c1",
    parentSiloRef: SILO_A,
    keywordIds: ["k1", "k2"],
    parentByKeywordId: new Map([["k1", SILO_A], ["k2", SILO_B]]),
  });
  assert.equal(resultado.ok, false);
  if (!resultado.ok) assert.match(resultado.reason, /outro Silo/);
});

test("candidato sem pai declarado não vira ArticleDNA", () => {
  const resultado = assertSingleParent({
    candidateRef: "c1",
    parentSiloRef: null,
    keywordIds: ["k1"],
    parentByKeywordId: new Map([["k1", SILO_A]]),
  });
  assert.equal(resultado.ok, false);
});

/* ------------- §11 o tema do pai não sai só do slug --------------------- */

test("o contexto do Silo entra no tema do pai, não só o endereço", () => {
  const soSlug = siloThemeTokens({ siloLabel: "Skin care", siloSlug: "/skin-care" });
  const comDna = siloThemeTokens({
    siloLabel: "Skin care",
    siloSlug: "/skin-care",
    centralEntity: "rotina facial",
    macroIntent: "escolher produtos para pele oleosa",
    boundaryIncludes: ["limpeza", "hidratação"],
    narrative: "guiar quem tem pele oleosa",
  });

  assert.ok(comDna.size > soSlug.size, "o DNA do Silo precisa acrescentar tema");
  for (const token of ["rotina", "facial", "oleosa", "limpeza", "hidratacao"]) {
    assert.ok(comDna.has(token), `o tema do pai devia conter "${token}"`);
  }
});

test("o contexto do pai muda a formação sem mexer no piso de convergência", () => {
  const keywords = [
    kw("k1", "rotina facial matinal"),
    kw("k2", "rotina facial noturna"),
  ];
  const semContexto = buildArticleFormationUniverse({
    siloRef: SILO_A, siloLabel: "Skin care", siloSlug: "/skin-care",
    keywords, publishedArticles: [],
  });
  const comContexto = buildArticleFormationUniverse({
    siloRef: SILO_A, siloLabel: "Skin care", siloSlug: "/skin-care",
    // "rotina facial" passa a ser tema do pai: o que distingue é matinal/noturna.
    siloContext: { centralEntity: "rotina facial" },
    keywords, publishedArticles: [],
  });

  // Sem contexto elas convergem pelo tema do pai repetido; com contexto, o que
  // sobra são dois momentos diferentes do dia.
  assert.equal(semContexto.candidates.length, 1);
  assert.equal(comContexto.candidates.length, 2);
});

/* ----------------------------- contrato duro ----------------------------- */

test("nenhum campo novo foi criado: o pai é o territoryRef que já existe", () => {
  const contratos = readFileSync("lib/arquiteto/contracts.ts", "utf8");
  const inicio = contratos.indexOf("export const ArticleDNASchema");
  const corpo = contratos.slice(inicio, contratos.indexOf("export type ArticleDNA", inicio));
  assert.match(corpo, /territoryRef: TerritoryRefSchema\.optional\(\)/);
  assert.doesNotMatch(corpo, /parentSiloRef|parentRef/);

  const adapters = readFileSync("lib/arquiteto/adapters.ts", "utf8");
  assert.match(adapters, /group\.territoryRef \? \{ territoryRef: group\.territoryRef \} : \{\}/);
});

test("o vínculo é leitura: o módulo não escreve nem chama nada", () => {
  const source = readFileSync("lib/arquiteto/article-parent-binding.ts", "utf8");
  assert.doesNotMatch(source, /fetch\(|supabase|persistArquitetoArtifact|createVersionEnvelope/);
});

/* -------------------- §21 a UI diz como o pai é conhecido ---------------- */

test("o painel distingue Silo declarado de Silo inferido", () => {
  const panel = readFileSync("modules/arquiteto/article-formation-panel.tsx", "utf8");
  assert.match(panel, /data-testid="architect-parent-binding"/);
  assert.match(panel, /inferido\(s\) do consenso das keywords \(legado\)/);
  assert.match(panel, /em conflito/);

  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(workspace, /PARENT_INFERRED_LEGACY/);
  assert.match(workspace, /articleParentBindings/);
});

test("a materialização recusa cross-silo antes de escrever", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const inicio = workspace.indexOf("const materializeApprovedArticleDnas");
  const corpo = workspace.slice(inicio, workspace.indexOf("\n  }, [", inicio));

  assert.match(corpo, /assertSingleParent\(\{/);
  // A checagem vem ANTES do envelope e da escrita.
  assert.ok(corpo.indexOf("assertSingleParent") < corpo.indexOf("createVersionEnvelope"));
  assert.match(corpo, /if \(!escopo\.ok\)/);
  assert.match(corpo, /continue;/);
});
