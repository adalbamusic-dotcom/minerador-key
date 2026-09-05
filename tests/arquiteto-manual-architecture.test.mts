import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  articleMembers,
  createArticleFromKeyword,
  effectivePrincipalCount,
  manualKeywordRoleFor,
  moveKeywordToArticle,
  normalizeArticlePrincipal,
  promoteManualPrincipal,
  setManualSupportRole,
  ungroupKeyword,
  type ManualArchitectureItem,
} from "../lib/arquiteto/manual-architecture.ts";
import { MAX_KEYWORDS_PER_ARTICLE } from "../lib/arquiteto/domain-rules.ts";
import { resolveArticleAiReviewBase } from "../lib/arquiteto/article-ai-review.ts";
import { deriveArticleProcessReadModel } from "../lib/arquiteto/article-process-read-model.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

type Item = ManualArchitectureItem & {
  volume_search?: number;
  analise_semantica?: Record<string, unknown>;
};

const keyword = (id: string, clusterId: string | null, role: Item["reviewRole"], extra: Partial<Item> = {}): Item => ({
  id,
  keyword: `keyword ${id}`,
  clusterId,
  provisionalGroupId: clusterId,
  reviewRole: role,
  isPublished: false,
  // Fatos upstream do Minerador: nenhuma operação humana pode tocá-los.
  volume_search: 880,
  analise_semantica: { intencao_principal: "Informacional", kgr_aplicabilidade: "aplicavel" },
  ...extra,
});

/** A: principal + 2 secundárias · B: principal + 1 secundária */
const workingCopy = (): Item[] => [
  keyword("a1", "art-a", "principal"),
  keyword("a2", "art-a", "secundaria"),
  keyword("a3", "art-a", "reforco_narrativo"),
  keyword("b1", "art-b", "principal"),
  keyword("b2", "art-b", "secundaria"),
  keyword("solta", null, null),
];

const fullArticle = (): Item[] => [
  ...workingCopy(),
  ...Array.from({ length: MAX_KEYWORDS_PER_ARTICLE }, (_, index) =>
    keyword(`c${index + 1}`, "art-cheio", index === 0 ? "principal" : "secundaria")),
];

const upstreamOf = (items: readonly Item[], id: string) => {
  const item = items.find(candidate => candidate.id === id)!;
  return { keyword: item.keyword, volume_search: item.volume_search, analise_semantica: item.analise_semantica };
};

const expectOk = <T,>(outcome: { ok: true; items: T[]; summary: string } | { ok: false; reason: string }) => {
  if (!outcome.ok) assert.fail(`operação deveria ser aceita: ${outcome.reason}`);
  return outcome;
};

test("A · toda ação preserva exatamente uma Principal efetiva", () => {
  const cenarios = [
    () => promoteManualPrincipal(workingCopy(), { articleKey: "art-a", keywordId: "a2" }),
    () => setManualSupportRole(workingCopy(), { articleKey: "art-a", keywordId: "a2", role: "reforco_narrativo" }),
    () => moveKeywordToArticle(workingCopy(), { keywordId: "a2", fromArticleKey: "art-a", toArticleKey: "art-b", maxKeywordsPerArticle: MAX_KEYWORDS_PER_ARTICLE }),
    () => ungroupKeyword(workingCopy(), { keywordId: "a2", articleKey: "art-a" }),
    () => createArticleFromKeyword(workingCopy(), { keywordId: "a2", articleKey: "art-a", newClusterId: "art-novo" }),
  ];

  for (const executar of cenarios) {
    const { items } = expectOk(executar());
    for (const clusterId of ["art-a", "art-b", "art-novo"]) {
      if (!articleMembers(items, clusterId).length) continue;
      assert.equal(effectivePrincipalCount(items, clusterId), 1, `${clusterId} precisa de exatamente 1 Principal`);
    }
  }
});

test("B · promover secundária troca a Principal sem deixar duas", () => {
  const { items } = expectOk(promoteManualPrincipal(workingCopy(), { articleKey: "art-a", keywordId: "a2" }));

  assert.equal(items.find(item => item.id === "a2")?.reviewRole, "principal");
  assert.notEqual(items.find(item => item.id === "a1")?.reviewRole, "principal");
  assert.equal(effectivePrincipalCount(items, "art-a"), 1);
  // O outro Article não é tocado.
  assert.equal(items.find(item => item.id === "b1")?.reviewRole, "principal");
});

test("C/D · Secundária ↔ Reforço narrativo nos dois sentidos", () => {
  const paraReforco = expectOk(setManualSupportRole(workingCopy(), { articleKey: "art-a", keywordId: "a2", role: "reforco_narrativo" }));
  assert.equal(manualKeywordRoleFor(paraReforco.items.find(item => item.id === "a2")!), "reforco_narrativo");

  const paraSecundaria = expectOk(setManualSupportRole(paraReforco.items, { articleKey: "art-a", keywordId: "a2", role: "secundaria" }));
  assert.equal(manualKeywordRoleFor(paraSecundaria.items.find(item => item.id === "a2")!), "secundaria");

  // Rebaixar a Principal sem eleger outra é recusado.
  const semNovaPrincipal = setManualSupportRole(workingCopy(), { articleKey: "art-a", keywordId: "a1", role: "secundaria" });
  assert.equal(semNovaPrincipal.ok, false);
});

test("E · mover secundária do artigo A para o artigo B", () => {
  const { items } = expectOk(moveKeywordToArticle(workingCopy(), {
    keywordId: "a2", fromArticleKey: "art-a", toArticleKey: "art-b", maxKeywordsPerArticle: MAX_KEYWORDS_PER_ARTICLE,
  }));

  assert.equal(articleMembers(items, "art-a").map(item => item.id).includes("a2"), false);
  assert.equal(articleMembers(items, "art-b").map(item => item.id).includes("a2"), true);
  assert.equal(items.find(item => item.id === "a2")?.reviewRole, "secundaria");
  assert.equal(items.find(item => item.id === "a2")?.provisionalGroupId, "art-b");
  // A Principal do destino não é deslocada.
  assert.equal(items.find(item => item.id === "b1")?.reviewRole, "principal");
});

test("F · destino cheio bloqueia o movimento, sem mutação parcial", () => {
  const items = fullArticle();

  const outcome = moveKeywordToArticle(items, {
    keywordId: "a2", fromArticleKey: "art-a", toArticleKey: "art-cheio", maxKeywordsPerArticle: MAX_KEYWORDS_PER_ARTICLE,
  });

  assert.equal(outcome.ok, false);
  assert.match(outcome.ok ? "" : outcome.reason, new RegExp(`máximo é ${MAX_KEYWORDS_PER_ARTICLE}`));
  assert.equal(articleMembers(items, "art-cheio").length, MAX_KEYWORDS_PER_ARTICLE);
  assert.equal(articleMembers(items, "art-a").length, 3);
});

test("G · retirar a keyword devolve para não agrupadas sem apagar o registro", () => {
  const before = workingCopy();
  const { items } = expectOk(ungroupKeyword(before, { keywordId: "a2", articleKey: "art-a" }));

  const solta = items.find(item => item.id === "a2")!;
  assert.equal(solta.clusterId, null);
  assert.equal(solta.provisionalGroupId, null);
  assert.equal(solta.reviewRole, null);
  assert.equal(items.length, before.length, "nenhuma keyword desaparece");
  assert.deepEqual(upstreamOf(items, "a2"), upstreamOf(before, "a2"));
});

test("H · criar artigo novo faz a keyword virar Principal do novo artigo", () => {
  const { items } = expectOk(createArticleFromKeyword(workingCopy(), {
    keywordId: "a2", articleKey: "art-a", newClusterId: "art-novo",
  }));

  assert.deepEqual(articleMembers(items, "art-novo").map(item => item.id), ["a2"]);
  assert.equal(items.find(item => item.id === "a2")?.reviewRole, "principal");
  assert.equal(effectivePrincipalCount(items, "art-novo"), 1);
  // Nenhum Silo é criado por esta operação.
  assert.equal(Object.prototype.hasOwnProperty.call(items.find(item => item.id === "a2")!, "siloId"), false);
});

test("I · mover a Principal exige eleger a nova Principal da origem", () => {
  const semEscolha = moveKeywordToArticle(workingCopy(), {
    keywordId: "a1", fromArticleKey: "art-a", toArticleKey: "art-b", maxKeywordsPerArticle: MAX_KEYWORDS_PER_ARTICLE,
  });
  assert.equal(semEscolha.ok, false);
  assert.match(semEscolha.ok ? "" : semEscolha.reason, /nova Principal/);

  const { items } = expectOk(moveKeywordToArticle(workingCopy(), {
    keywordId: "a1", fromArticleKey: "art-a", toArticleKey: "art-b",
    maxKeywordsPerArticle: MAX_KEYWORDS_PER_ARTICLE, nextPrincipalKeywordId: "a3",
  }));
  assert.equal(effectivePrincipalCount(items, "art-a"), 1);
  assert.equal(items.find(item => item.id === "a3")?.reviewRole, "principal");
  assert.equal(items.find(item => item.id === "a1")?.reviewRole, "secundaria");

  // A nova Principal precisa continuar no artigo de origem.
  const foraDaOrigem = moveKeywordToArticle(workingCopy(), {
    keywordId: "a1", fromArticleKey: "art-a", toArticleKey: "art-b",
    maxKeywordsPerArticle: MAX_KEYWORDS_PER_ARTICLE, nextPrincipalKeywordId: "b2",
  });
  assert.equal(foraDaOrigem.ok, false);
});

test("J · artigo de uma keyword só: mover esvazia o grupo sem deixar artigo inválido", () => {
  const items: Item[] = [keyword("solo", "art-solo", "principal"), keyword("b1", "art-b", "principal")];

  const outcome = expectOk(moveKeywordToArticle(items, {
    keywordId: "solo", fromArticleKey: "art-solo", toArticleKey: "art-b", maxKeywordsPerArticle: MAX_KEYWORDS_PER_ARTICLE,
  }));

  assert.equal(articleMembers(outcome.items, "art-solo").length, 0, "o grupo vazio deixa de existir");
  assert.equal(articleMembers(outcome.items, "art-b").length, 2);
  assert.equal(effectivePrincipalCount(outcome.items, "art-b"), 1);
});

test("K · destino inexistente é recusado; nenhuma operação cruza área de trabalho", () => {
  const outcome = moveKeywordToArticle(workingCopy(), {
    keywordId: "a2", fromArticleKey: "art-a", toArticleKey: "art-de-outra-brand", maxKeywordsPerArticle: MAX_KEYWORDS_PER_ARTICLE,
  });

  assert.equal(outcome.ok, false);
  assert.match(outcome.ok ? "" : outcome.reason, /não existe nesta área de trabalho/);
  // A UI só oferece artigos da própria working copy.
  assert.match(workspace, /manualMoveTargetsFor/);
});

test("Q · nenhuma operação muta fatos da KeywordDNA", () => {
  const before = workingCopy();
  const operacoes = [
    promoteManualPrincipal(before, { articleKey: "art-a", keywordId: "a2" }),
    setManualSupportRole(before, { articleKey: "art-a", keywordId: "a2", role: "reforco_narrativo" }),
    moveKeywordToArticle(before, { keywordId: "a2", fromArticleKey: "art-a", toArticleKey: "art-b", maxKeywordsPerArticle: MAX_KEYWORDS_PER_ARTICLE }),
    ungroupKeyword(before, { keywordId: "a2", articleKey: "art-a" }),
    createArticleFromKeyword(before, { keywordId: "a2", articleKey: "art-a", newClusterId: "art-novo" }),
  ];

  for (const outcome of operacoes) {
    const { items } = expectOk(outcome);
    for (const id of ["a1", "a2", "a3", "b1", "b2", "solta"]) {
      assert.deepEqual(upstreamOf(items, id), upstreamOf(before, id), `${id} não pode ter fato upstream alterado`);
    }
  }
});

test("R · o teto de 6 keywords por artigo é preservado em toda entrada", () => {
  const items = fullArticle();

  for (const membro of articleMembers(items, "art-a")) {
    const outcome = moveKeywordToArticle(items, {
      keywordId: membro.id, fromArticleKey: "art-a", toArticleKey: "art-cheio",
      maxKeywordsPerArticle: MAX_KEYWORDS_PER_ARTICLE, nextPrincipalKeywordId: "a3",
    });
    assert.equal(outcome.ok, false, `${membro.id} não pode entrar em artigo cheio`);
  }
});

test("S · artigo publicado mantém a Principal e as keywords protegidas", () => {
  const items: Item[] = [
    keyword("p1", "art-pub", "principal", { isPublished: true, primaryKeywordPolicy: "locked" }),
    keyword("p2", "art-pub", "secundaria", { isPublished: true }),
    keyword("b1", "art-b", "principal"),
  ];

  assert.equal(promoteManualPrincipal(items, { articleKey: "art-pub", keywordId: "p2" }).ok, false);
  assert.equal(setManualSupportRole(items, { articleKey: "art-pub", keywordId: "p2", role: "reforco_narrativo" }).ok, false);
  assert.equal(moveKeywordToArticle(items, { keywordId: "p2", fromArticleKey: "art-pub", toArticleKey: "art-b", maxKeywordsPerArticle: MAX_KEYWORDS_PER_ARTICLE }).ok, false);
  assert.equal(ungroupKeyword(items, { keywordId: "p2", articleKey: "art-pub" }).ok, false);
  assert.equal(createArticleFromKeyword(items, { keywordId: "p2", articleKey: "art-pub", newClusterId: "novo" }).ok, false);
});

test("normalizeArticlePrincipal conserta um grupo com duas Principais", () => {
  // Estado transitório real observado em produção: duas keywords "principal".
  const inconsistente: Item[] = [
    keyword("a1", "art-a", "principal"),
    keyword("a2", "art-a", "principal"),
    keyword("a3", "art-a", "secundaria"),
  ];
  assert.equal(effectivePrincipalCount(inconsistente, "art-a"), 2);

  const corrigido = normalizeArticlePrincipal(inconsistente, "art-a", "a1");

  assert.equal(effectivePrincipalCount(corrigido, "art-a"), 1);
  assert.equal(corrigido.find(item => item.id === "a1")?.reviewRole, "principal");
  assert.equal(corrigido.find(item => item.id === "a2")?.reviewRole, "secundaria");
});

const baseHashFor = async (items: readonly Item[], clusterId: string) => {
  const members = articleMembers(items, clusterId);
  const principal = members.find(item => item.reviewRole === "principal");
  const base = await resolveArticleAiReviewBase({
    articleId: clusterId,
    principalKeywordId: principal ? String(principal.id) : null,
    keywords: members.map(item => ({ keywordId: String(item.id), role: (item.reviewRole ?? null) as never })),
    articleDna: null,
    serpAssessment: null,
  });
  return base.articleContentHash;
};

test("N/O · mudança estrutural humana desatualiza a revisão IA e a SERP da formação", async () => {
  const before = workingCopy();
  const antes = await baseHashFor(before, "art-a");

  const trocaPrincipal = expectOk(promoteManualPrincipal(before, { articleKey: "art-a", keywordId: "a2" }));
  const moveKeyword = expectOk(moveKeywordToArticle(before, {
    keywordId: "a2", fromArticleKey: "art-a", toArticleKey: "art-b", maxKeywordsPerArticle: MAX_KEYWORDS_PER_ARTICLE,
  }));
  const trocaPapel = expectOk(setManualSupportRole(before, { articleKey: "art-a", keywordId: "a2", role: "reforco_narrativo" }));

  for (const [nome, resultado] of [["principal", trocaPrincipal], ["move", moveKeyword], ["papel", trocaPapel]] as const) {
    const depois = await baseHashFor(resultado.items, "art-a");
    assert.notEqual(depois, antes, `${nome} precisa invalidar a base revisada`);
    // A revisão anterior vira histórico explícito, nunca "não executada".
    const model = deriveArticleProcessReadModel({
      logicProcessing: false, hasLogicalOutput: true, serpProcessing: false, hasSerpAssessment: true, serpHasError: false,
      aiProcessing: false, pendingProposalCount: 0, annotations: [], humanPendingDecisionCount: 0, reviewProcessing: false,
      durableAiState: "COMPLETED_WITH_PROPOSALS", durableMaterialProposalCount: 2, durablePendingProposalCount: 2,
      aiBaseChanged: depois !== antes,
    });
    assert.equal(model.ai.state, "STALE", nome);
    assert.equal(model.ai.proposalCount, 0, nome);
  }
});

test("P · mudança apenas de Silo não desatualiza a revisão IA", async () => {
  const before = workingCopy();
  const antes = await baseHashFor(before, "art-a");
  // Etapa Silos: o Article recebe um Silo sem mudar a formação.
  const comSilo = before.map(item => String(item.clusterId) === "art-a" ? { ...item, siloId: "silo-123" } : item);

  const depois = await baseHashFor(comSilo, "art-a");

  assert.equal(depois, antes);
  const model = deriveArticleProcessReadModel({
    logicProcessing: false, hasLogicalOutput: true, serpProcessing: false, hasSerpAssessment: true, serpHasError: false,
    aiProcessing: false, pendingProposalCount: 0, annotations: [], humanPendingDecisionCount: 0, reviewProcessing: false,
    durableAiState: "COMPLETED_WITH_PROPOSALS", durableMaterialProposalCount: 2, durablePendingProposalCount: 2,
    aiBaseChanged: depois !== antes,
  });
  assert.equal(model.ai.state, "COMPLETED_WITH_PROPOSALS");
});

test("V · nenhuma ação humana dispara provider automaticamente", () => {
  const secao = workspace.slice(workspace.indexOf("const commitManualArchitectureOutcome"), workspace.indexOf("const articleProcessReadModelFor"));

  assert.doesNotMatch(secao, /callStrategicApi|revalidate-structure|arquiteto\/serp|generateStructuredAI/);
  // Mudança estrutural avisa; não reexecuta.
  assert.match(readFileSync("lib/arquiteto/manual-architecture-interaction.ts", "utf8"), /atualize a SERP e execute a IA novamente/);
});

test("a Revisão expõe as ações estruturais e usa a mutação canônica", () => {
  assert.match(workspace, /data-testid="architect-review-architecture"/);
  assert.match(workspace, /Definir como Principal/);
  assert.match(workspace, /Mover para outro artigo/);
  assert.match(workspace, /Retirar do artigo/);
  assert.match(workspace, /Criar novo artigo/);
  // Confirmação curta com antes/depois/impacto nas ações de maior impacto.
  assert.match(workspace, /data-testid="architect-review-architecture-confirm"/);
  assert.match(workspace, /Antes<\/dt>/);
  assert.match(workspace, /Depois<\/dt>/);
  assert.match(workspace, /Impacto:/);
  // Read-model único: toda ação passa por masterList + provisionalGroups + persistência canônica.
  const handler = workspace.slice(workspace.indexOf("const commitManualArchitectureOutcome"), workspace.indexOf("const handleManualSupportRole"));
  assert.match(handler, /setMasterList\(items\)/);
  assert.match(handler, /setProvisionalGroups\(describeAssignedGroups\(items\)\)/);
  assert.match(handler, /persistWorkingCopyAssignments\(changed/);
  assert.match(handler, /pushMasterHistory\(previous, historyLabel\)/);
  assert.doesNotMatch(handler, /localStorage/);
});

test("clusterId repetido não confunde dois Articles distintos", () => {
  // Caso real: a importação deixou dois Articles com o mesmo clusterId "1".
  const items: Item[] = [
    keyword("x1", "1", "principal", { provisionalGroupId: "group-x" }),
    keyword("x2", "1", "secundaria", { provisionalGroupId: "group-x" }),
    keyword("y1", "1", "principal", { provisionalGroupId: "group-y" }),
    keyword("y2", "1", "secundaria", { provisionalGroupId: "group-y" }),
  ];

  // A identidade do Article é o grupo canônico, não o cluster herdado.
  assert.deepEqual(articleMembers(items, "group-x").map(item => item.id), ["x1", "x2"]);
  assert.deepEqual(articleMembers(items, "group-y").map(item => item.id), ["y1", "y2"]);
  assert.equal(effectivePrincipalCount(items, "group-x"), 1);
  assert.equal(effectivePrincipalCount(items, "group-y"), 1);

  const { items: movido } = expectOk(moveKeywordToArticle(items, {
    keywordId: "x2", fromArticleKey: "group-x", toArticleKey: "group-y", maxKeywordsPerArticle: MAX_KEYWORDS_PER_ARTICLE,
  }));

  assert.deepEqual(articleMembers(movido, "group-x").map(item => item.id), ["x1"]);
  assert.deepEqual([...articleMembers(movido, "group-y").map(item => item.id)].sort(), ["x2", "y1", "y2"]);
  // O Article vizinho não perde a própria Principal.
  assert.equal(movido.find(item => item.id === "y1")?.reviewRole, "principal");
  assert.equal(effectivePrincipalCount(movido, "group-y"), 1);
});

test("a lista de destinos usa identidade única por artigo", () => {
  

  // Filtro e chave do React saem do id do artigo, nunca do clusterId.
  const interacao = readFileSync("lib/arquiteto/manual-architecture-interaction.ts", "utf8");
  assert.match(interacao, /article\.id !== input\.currentArticleId/);
  assert.match(workspace, /id: candidate\.id,/);
  assert.match(workspace, /moveTargets\.map\(target => <option key=\{target\.id\} value=\{target\.id\}/);
  assert.doesNotMatch(workspace, /key=\{target\.clusterId\}/);
});
