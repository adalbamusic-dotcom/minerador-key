import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildArticleFormationUniverse, type ArticleFormationUniverse } from "../lib/arquiteto/article-formation.ts";
import {
  applyScenarioChange,
  comparePrincipalCandidates,
  describeScenarioChange,
  scenarioGroupsOf,
  simulateScenarioChange,
  type ScenarioKeyword,
} from "../lib/arquiteto/formation-scenario.ts";

const SILO = "territory:11111111-1111-4111-8111-111111111111";

const kw = (id: string, keyword: string, extra: Partial<ScenarioKeyword> = {}): ScenarioKeyword => ({
  keywordId: id, keyword, intent: "informacional", volume: 100, kgr: 0.3,
  entity: null, problem: null, isPublished: false, ...extra,
});

/** Duas famílias claramente distintas dentro do mesmo Silo. */
const KEYWORDS: ScenarioKeyword[] = [
  kw("k1", "skin care para peles oleosas", { volume: 900, results: 400, kgr: 0.44 }),
  kw("k2", "skin care pele oleosa masculina", { volume: 300, results: 180, kgr: 0.6 }),
  kw("k3", "cremes skin care", { volume: 500, results: 900, kgr: 1.8 }),
  kw("k4", "creme skin care noturno", { volume: 210, results: 150, kgr: 0.71 }),
];

const LABELS = new Map(KEYWORDS.map(item => [item.keywordId, item.keyword]));

const universo = (groups: { principalKeywordId: string; keywordIds: string[] }[]): ArticleFormationUniverse =>
  buildArticleFormationUniverse({
    siloRef: SILO,
    siloLabel: "Skin care para peles oleosas",
    siloSlug: "/skin-care-para-peles-oleosas",
    groups,
    keywords: KEYWORDS,
  });

const CENARIO = () => universo([
  { principalKeywordId: "k1", keywordIds: ["k1", "k2"] },
  { principalKeywordId: "k3", keywordIds: ["k3", "k4"] },
]);

const simular = (change: Parameters<typeof simulateScenarioChange>[0]["change"]) =>
  simulateScenarioChange({ universe: CENARIO(), keywords: KEYWORDS, keywordLabels: LABELS, change });

/* ------------------- o cenário sai da leitura, não de nova conta --------- */

test("o cenário simulado é a composição que a mesa está exibindo", () => {
  const universe = CENARIO();
  const grupos = scenarioGroupsOf(universe);
  assert.equal(grupos.length, 2);
  assert.deepEqual(grupos.map(group => group.keywordIds.length).sort(), [2, 2]);
  // O slot é a identidade da composição, não o identificador derivado da
  // Principal: trocar quem lidera não pode parecer artigo destruído.
  assert.deepEqual(grupos.map(group => group.slot), universe.candidates.map(item => item.candidateRef));
});

/* --------------------------- §8 antes / depois --------------------------- */

test("mover uma busca entre artigos do mesmo Silo mostra efeito nos DOIS", () => {
  const universe = CENARIO();
  const [primeiro, segundo] = universe.candidates;
  const comparacao = simular({
    kind: "move_keyword",
    keywordId: "k4",
    fromCandidateRef: segundo.candidateRef,
    toCandidateRef: primeiro.candidateRef,
  });

  assert.equal(comparacao.refusal, null);
  // Os dois artigos aparecem dos dois lados da comparação.
  assert.equal(comparacao.before.length, 2);
  assert.equal(comparacao.after.length, 2);

  const contagens = comparacao.effects.filter(effect => effect.metric === "Keywords");
  assert.equal(contagens.length, 2);
  assert.ok(contagens.some(effect => effect.before === "2" && effect.after === "3"));
  assert.ok(contagens.some(effect => effect.before === "2" && effect.after === "1"));
});

test("todo número exibido chega com a frase que o justifica", () => {
  const universe = CENARIO();
  const comparacao = simular({
    kind: "move_keyword",
    keywordId: "k4",
    fromCandidateRef: universe.candidates[1].candidateRef,
    toCandidateRef: universe.candidates[0].candidateRef,
  });
  // §9: score sem explicação seria pedir confiança cega.
  for (const effect of comparacao.effects) {
    assert.ok(effect.explanation.trim().length > 0, `efeito ${effect.metric} sem explicação`);
  }
  assert.ok(comparacao.conclusion.trim().length > 0);
});

test("a conclusão cita os números que a tela mostra", () => {
  const universe = CENARIO();
  const comparacao = simular({
    kind: "split_keyword",
    candidateRef: universe.candidates[0].candidateRef,
    keywordId: "k2",
  });
  assert.equal(comparacao.refusal, null);
  assert.ok(["melhora", "piora", "neutra"].includes(comparacao.verdict));
  // Separar cria um artigo que não existia; a comparação diz isso em texto.
  const nascimento = comparacao.effects.find(effect => effect.metric === "Existência");
  assert.ok(nascimento, "separar precisa registrar o artigo que passa a existir");
  assert.equal(nascimento!.before, "não existia");
});

/* ------------------------------ §7/§11 recusas --------------------------- */

test("mover para outro Silo não é arrasto: vira decisão territorial", () => {
  const universe = CENARIO();
  const comparacao = simular({
    kind: "move_to_silo",
    keywordId: "k2",
    fromCandidateRef: universe.candidates[0].candidateRef,
    targetSiloRef: "territory:22222222-2222-4222-8222-222222222222",
  });
  assert.equal(comparacao.verdict, "recusada");
  assert.equal(comparacao.refusal?.code, "CROSS_SILO_REQUIRES_TERRITORIAL_DECISION");
  assert.match(comparacao.conclusion, /membership territorial/);
  // Recusa não desenha comparação: não há "depois" a mostrar.
  assert.deepEqual(comparacao.after, []);
});

test("a Principal não sai do artigo pela porta dos fundos", () => {
  const universe = CENARIO();
  const ref = universe.candidates[0].candidateRef;
  for (const change of [
    { kind: "move_keyword" as const, keywordId: "k1", fromCandidateRef: ref, toCandidateRef: universe.candidates[1].candidateRef },
    { kind: "split_keyword" as const, candidateRef: ref, keywordId: "k1" },
    { kind: "remove_keyword" as const, candidateRef: ref, keywordId: "k1" },
  ]) {
    const comparacao = simular(change);
    assert.equal(comparacao.refusal?.code, "PRINCIPAL_WOULD_LEAVE", `${change.kind} deveria recusar`);
  }
});

test("o teto de seis é recusa de contrato, não sugestão", () => {
  const grandes = Array.from({ length: 6 }, (_, index) => kw(`g${index}`, `skin care para peles oleosas ${index}`));
  const universe = buildArticleFormationUniverse({
    siloRef: SILO, siloLabel: "Skin care", siloSlug: "/skin-care",
    groups: [
      { principalKeywordId: "g0", keywordIds: grandes.map(item => item.keywordId) },
      { principalKeywordId: "x1", keywordIds: ["x1"] },
    ],
    keywords: [...grandes, kw("x1", "cremes skin care")],
  });
  const grupos = scenarioGroupsOf(universe);
  const aplicado = applyScenarioChange(grupos, {
    kind: "move_keyword",
    keywordId: "x1",
    fromCandidateRef: grupos[1].slot,
    toCandidateRef: grupos[0].slot,
  });
  assert.equal(aplicado.refusal?.code, "CEILING_REACHED");
});

/* ---------------------------- §7 papel editorial ------------------------- */

test("trocar secundária por reforço não mexe na composição — e diz isso", () => {
  const universe = CENARIO();
  const comparacao = simular({
    kind: "set_role",
    candidateRef: universe.candidates[0].candidateRef,
    keywordId: "k2",
    role: "reforco",
  });
  assert.equal(comparacao.refusal, null);
  assert.equal(comparacao.verdict, "neutra");
  assert.match(comparacao.conclusion, /papel editorial/);
  const keywords = comparacao.effects.find(effect => effect.metric === "Keywords");
  assert.equal(keywords?.before, keywords?.after);
});

/* ------------------------- §10 comparar Principal ------------------------ */

test("a comparação de Principal usa só dados que já existem", () => {
  const universe = CENARIO();
  const comparacao = comparePrincipalCandidates({
    candidate: universe.candidates[0],
    keywords: KEYWORDS,
    currentKeywordId: "k1",
    proposedKeywordId: "k2",
    suggestedSlug: universe.candidates[0].suggestedSlug,
  });

  const criterios = comparacao.criteria.map(item => item.criterion);
  for (const esperado of ["Volume", "Resultados", "KGR", "Intenção", "Funil", "Centralidade", "Cobertura do grupo", "Slug", "SERP", "Proteções"]) {
    assert.ok(criterios.includes(esperado), `falta o critério ${esperado}`);
  }
  // Nenhuma nota final: somar critérios de naturezas diferentes esconderia o
  // trade-off que o humano precisa ver.
  assert.ok(!("score" in comparacao));
  for (const item of comparacao.criteria) assert.ok(item.explanation.trim().length > 0);
  assert.match(comparacao.reading, /escolha continua sendo sua|decisão é editorial/);
});

test("menos resultados favorece a proposta; mais volume também", () => {
  const universe = CENARIO();
  const comparacao = comparePrincipalCandidates({
    candidate: universe.candidates[0],
    keywords: KEYWORDS,
    currentKeywordId: "k1",
    proposedKeywordId: "k2",
  });
  // k2 tem menos resultados (180 < 400) e menos volume (300 < 900).
  assert.equal(comparacao.criteria.find(item => item.criterion === "Resultados")?.favors, "proposta");
  assert.equal(comparacao.criteria.find(item => item.criterion === "Volume")?.favors, "atual");
});

test("identidade publicada travada não troca de Principal por aqui", () => {
  const publicadas: ScenarioKeyword[] = [
    kw("p1", "skin care para peles oleosas", { isPublished: true, protectedPublication: true }),
    kw("p2", "skin care pele oleosa masculina"),
  ];
  const universe = buildArticleFormationUniverse({
    siloRef: SILO, siloLabel: "Skin care", siloSlug: "/skin-care",
    groups: [{ principalKeywordId: "p1", keywordIds: ["p1", "p2"] }],
    keywords: publicadas,
  });
  const comparacao = comparePrincipalCandidates({
    candidate: universe.candidates[0],
    keywords: publicadas,
    currentKeywordId: "p1",
    proposedKeywordId: "p2",
  });
  assert.equal(comparacao.refusal?.code, "PUBLISHED_PRINCIPAL_PROTECTED");
  assert.deepEqual(comparacao.criteria, []);
});

/* ----------------------------- §16 desfazer ------------------------------ */

test("desfazer devolve exatamente a composição de origem", () => {
  const universe = CENARIO();
  const grupos = scenarioGroupsOf(universe);
  const ida = applyScenarioChange(grupos, {
    kind: "move_keyword",
    keywordId: "k4",
    fromCandidateRef: grupos[1].slot,
    toCandidateRef: grupos[0].slot,
  });
  assert.equal(ida.refusal, null);
  const volta = applyScenarioChange(ida.groups, {
    kind: "move_keyword",
    keywordId: "k4",
    fromCandidateRef: grupos[0].slot,
    toCandidateRef: grupos[1].slot,
  });
  assert.equal(volta.refusal, null);
  const normalizar = (lista: typeof grupos) => lista
    .map(group => ({ slot: group.slot, principal: group.principalKeywordId, keywords: [...group.keywordIds].sort() }))
    .sort((left, right) => left.slot.localeCompare(right.slot));
  assert.deepEqual(normalizar(volta.groups), normalizar(grupos));
});

/* --------------------------- descrição humana ---------------------------- */

test("a proposta é descrita com o nome da busca, nunca com id cru", () => {
  const descricao = describeScenarioChange({ kind: "split_keyword", candidateRef: "x", keywordId: "k2" }, LABELS);
  assert.match(descricao, /skin care pele oleosa masculina/);
  assert.doesNotMatch(descricao, /\bk2\b/);
});

/* ------------------------------ pureza ----------------------------------- */

test("o simulador não persiste, não chama rede e não materializa", () => {
  const source = readFileSync("lib/arquiteto/formation-scenario.ts", "utf8")
    .split("\n")
    .filter(line => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    })
    .join("\n");
  assert.doesNotMatch(source, /fetch\(|supabase|localStorage|persistArquitetoArtifact|createVersionEnvelope/);
  assert.doesNotMatch(source, /useState|useMemo/);
});

test("a simulação não escreve no read-model que a mesa está exibindo", () => {
  const universe = buildArticleFormationUniverse({
    siloRef: SILO, siloLabel: "Skin care", siloSlug: "/skin-care",
    groups: [{ principalKeywordId: "k1", keywordIds: ["k1", "k2"] }],
    keywords: KEYWORDS,
    publishedArticles: [{
      normalizedUrl: "site.com.br/skin-care/guia", path: "/skin-care/guia",
      label: "Guia de skin care", canonical: "site.com.br/skin-care/guia", matchedKeywordId: null,
    }],
  });
  const antes = JSON.stringify(universe.publishedArticles);
  simulateScenarioChange({
    universe, keywords: KEYWORDS, keywordLabels: LABELS,
    change: { kind: "change_principal", candidateRef: universe.candidates[0].candidateRef, keywordId: "k2" },
  });
  assert.equal(JSON.stringify(universe.publishedArticles), antes);
});

/* ------------------- §9 o veredito não pode se auto-favorecer ------------ */

test("separar não vira melhoria automática por causa da busca sozinha", () => {
  const universe = CENARIO();
  const comparacao = simular({
    kind: "split_keyword",
    candidateRef: universe.candidates[0].candidateRef,
    keywordId: "k2",
  });
  // Uma busca sozinha marca 100 por definição; incluir o artigo recém-criado
  // na média faria TODA separação parecer melhoria.
  assert.match(comparacao.conclusion, /passa a existir como conteúdo próprio/);
  assert.match(comparacao.conclusion, /apenas reflete uma busca sozinha/);
  const nascido = comparacao.after.find(item => !comparacao.before.some(antes => antes.slot === item.slot));
  assert.ok(nascido, "o artigo novo aparece no depois");
  assert.doesNotMatch(comparacao.conclusion, new RegExp(`de \d+ para ${nascido!.coherence.value}\b`));
});

test("juntar dois artigos não é penalizado pelo que deixou de existir", () => {
  const universe = CENARIO();
  const comparacao = simular({
    kind: "merge_candidates",
    leftCandidateRef: universe.candidates[0].candidateRef,
    rightCandidateRef: universe.candidates[1].candidateRef,
  });
  assert.equal(comparacao.refusal, null);
  assert.match(comparacao.conclusion, /deixa de existir como artigo separado/);
});
