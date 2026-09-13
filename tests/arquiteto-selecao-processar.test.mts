import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveFormationSelectionScope,
  scopeFormationUniverses,
} from "../lib/arquiteto/article-selection-scope.ts";
import { articleSelectionIdForCandidate } from "../lib/arquiteto/article-selection.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

/**
 * O BLOQUEIO REAL DA HOMOLOGAÇÃO — 2026-09-08, 17:15.
 *
 * A pessoa marcou o checkbox de "skincare para pele oleosa" (4 keywords). A
 * planilha mostrou "1 artigo selecionado", o botão ficou habilitado, e o
 * clique respondeu "Selecione pelo menos um artigo."
 *
 *   UI_SELECTION_COUNT      = 1
 *   PROCESS_SELECTION_COUNT = 0
 *
 * A seleção estava certa. O que estava errado era o handler ler um escopo
 * congelado na renderização em que foi criado — aquela em que nada estava
 * selecionado. O painel lia o escopo de agora; o handler, o de antes.
 */

/* ==================== §3 · o cenário real vira fixture =================== */

const CANDIDATO = "article-candidate:territory:9da03dd0-cf37-45c3-8562-20e943aa37bd:e42cd892-c5c8-408b-8f12-8128f5310828";

const linha = (candidateRef: string, keywordPrincipal: string) => ({
  id: articleSelectionIdForCandidate(candidateRef)!,
  candidateRef,
  keywordPrincipal,
});

const MESA = [
  linha(CANDIDATO, "skincare para pele oleosa"),
  linha("article-candidate:territory:9da03dd0:vitamina", "skincare vitamina c"),
  linha("article-candidate:territory:9da03dd0:mascara", "mascara facial skin care"),
  linha("article-candidate:territory:9da03dd0:nivea", "skin care nivea"),
  linha("article-candidate:territory:9da03dd0:noturno", "skin care noturno"),
];

test("§3 — 1 candidato marcado resolve para 1 candidateRef, o da linha", () => {
  const escopo = resolveFormationSelectionScope({
    selectedArticleIds: new Set([MESA[0].id]),
    articles: MESA,
  });
  assert.equal(escopo.selectedCount, 1, "VISIBLE_SELECTED_COUNT");
  assert.equal(escopo.candidateRefs.size, 1, "RESOLVED_SELECTED_COUNT");
  assert.deepEqual([...escopo.candidateRefs], [CANDIDATO]);
  assert.equal(escopo.ok, true);
  assert.equal(escopo.reason, null, "com seleção válida não existe recusa");
});

test("§5 — a identidade da linha resolve para o candidateRef, e só para ele", () => {
  // Não é id de ArticleDNA, não é keywordId, não é id de grupo provisório.
  assert.equal(MESA[0].id, `article-candidate:${encodeURIComponent(CANDIDATO)}`);
  const escopo = resolveFormationSelectionScope({
    selectedArticleIds: new Set([MESA[0].id]),
    articles: MESA,
  });
  assert.equal([...escopo.candidateRefs][0], MESA[0].candidateRef);
});

/* ========================= §10 · seleção em lote ========================= */

const escopoDe = (ids: string[]) => resolveFormationSelectionScope({
  selectedArticleIds: new Set(ids),
  articles: MESA,
});

test("§10-A — um selecionado: 1 / 1", () => {
  const escopo = escopoDe([MESA[0].id]);
  assert.equal(escopo.selectedCount, 1);
  assert.equal(escopo.candidateRefs.size, 1);
});

test("§10-B — três selecionados: 3 / 3", () => {
  const escopo = escopoDe([MESA[0].id, MESA[1].id, MESA[2].id]);
  assert.equal(escopo.selectedCount, 3);
  assert.equal(escopo.candidateRefs.size, 3);
  assert.equal(escopo.ok, true);
});

test("§10-C — todos selecionados: N / N", () => {
  const escopo = escopoDe(MESA.map(item => item.id));
  assert.equal(escopo.selectedCount, MESA.length);
  assert.equal(escopo.candidateRefs.size, MESA.length);
});

test("§10-D — nenhum selecionado: 0 / 0, e a recusa é a frase curta", () => {
  const escopo = escopoDe([]);
  assert.equal(escopo.selectedCount, 0);
  assert.equal(escopo.candidateRefs.size, 0);
  assert.equal(escopo.ok, false);
  assert.equal(escopo.reason, "Selecione pelo menos um artigo.");
});

test("§10-E/§6 — candidato SEM ArticleDNA continua processável", () => {
  /*
   * Estamos ANTES de Processar artigos: ArticleDNA = 0 é o esperado. A
   * autoridade só olha `candidateRef` — nada aqui pergunta por artefato.
   */
  const escopo = escopoDe([MESA[0].id]);
  assert.equal(escopo.ok, true);
  const universos = scopeFormationUniverses({
    universes: [{ candidates: MESA.map(item => ({ candidateRef: item.candidateRef })) }],
    selectedCandidateRefs: escopo.candidateRefs,
  });
  assert.equal(universos.length, 1);
  assert.equal(universos[0].candidates.length, 1);
  assert.equal(universos[0].candidates[0].candidateRef, CANDIDATO);
});

/* ================== §4 · a seleção que envelheceu é nomeada ============== */

test("§4 — id selecionado que sumiu do cenário é dito, não confundido", () => {
  const escopo = resolveFormationSelectionScope({
    // A formação recompôs e a Principal mudou: o id guardado ficou órfão.
    selectedArticleIds: new Set(["article-candidate:territory%3A9da03dd0%3Aprincipal-antiga"]),
    articles: MESA,
  });
  assert.equal(escopo.selectedCount, 1);
  assert.equal(escopo.candidateRefs.size, 0);
  assert.equal(escopo.missing.length, 1);
  assert.match(escopo.reason || "", /não existem mais no cenário/);
  // E NÃO a frase curta, que mandaria selecionar o que já está selecionado.
  assert.notEqual(escopo.reason, "Selecione pelo menos um artigo.");
});

test("§8 — linha selecionada sem candidateRef recebe erro específico", () => {
  const escopo = resolveFormationSelectionScope({
    selectedArticleIds: new Set(["article-working:legado"]),
    articles: [...MESA, { id: "article-working:legado", candidateRef: null, keywordPrincipal: "artigo de acervo" }],
  });
  assert.equal(escopo.ok, false);
  assert.equal(escopo.candidateRefs.size, 0);
  assert.match(escopo.reason || "", /artigo de acervo/);
  assert.notEqual(escopo.reason, "Selecione pelo menos um artigo.");
});

/* =============== §1/§2/§7 · a autoridade é lida no clique =============== */

test("§2 — a autoridade é única e é lida no CLIQUE, não na renderização", () => {
  /*
   * O defeito: `processArticleFormation` e `confirmArticleFormation` são
   * `useCallback` e liam `formationSelectionScope` sem citá-lo nas
   * dependências. Ficavam congelados na renderização em que nasceram.
   */
  assert.match(workspace, /const formationScopeRef = useRef\(\{ scope: formationSelectionScope, universes: selectedFormationUniverses \}\)/);
  assert.match(workspace, /formationScopeRef\.current = \{ scope: formationSelectionScope, universes: selectedFormationUniverses \};/);

  for (const handler of ["const processArticleFormation", "const confirmArticleFormation"]) {
    const trecho = workspace.slice(workspace.indexOf(handler));
    const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
    assert.match(corpo, /formationScopeRef\.current/, `${handler} não lê a autoridade no clique`);
    // E nenhum dos dois volta a ler a memo congelada.
    assert.doesNotMatch(corpo, /= formationSelectionScope;/, `${handler} voltou a capturar a memo`);
  }
});

test("§7 — nenhum handler da aba Artigos emite a frase por conta própria", () => {
  const ocorrencias = workspace.split("Selecione pelo menos um artigo.").length - 1;
  // Só os três handlers, e cada um como fallback DEPOIS da autoridade recusar.
  assert.equal(ocorrencias, 3, "surgiu um caminho novo emitindo a frase");
  for (const marca of ["escopo.reason ??", "escopoDoFechamento.reason ??"]) {
    assert.ok(workspace.includes(marca), `a frase precisa vir de uma recusa da autoridade: ${marca}`);
  }
  // O fechamento em lote deixou de decidir por contagem local.
  const fechamento = workspace.slice(workspace.indexOf("const applyClosingToSelection"));
  const corpo = fechamento.slice(0, fechamento.indexOf("\n  };"));
  assert.match(corpo, /const escopoDoFechamento = formationScopeRef\.current\.scope;/);
  assert.doesNotMatch(corpo, /if \(!selecionados\.length\) return showNotification/);
});

test("§8 — botão e handler usam a MESMA leitura", () => {
  // O painel recebe contagem e recusa da autoridade; o botão desabilita pela
  // recusa. Handler e botão não podem discordar sobre a mesma seleção.
  assert.match(workspace, /selectedCount=\{formationSelectionScope\.selectedCount\}/);
  assert.match(workspace, /scopeReason=\{formationSelectionScope\.reason\}/);
  const painel = readFileSync("modules/arquiteto/article-formation-panel.tsx", "utf8");
  assert.match(painel, /disabled=\{busy \|\| Boolean\(scopeReason\)\}/);
  assert.match(painel, /disabled=\{busy \|\| !processed \|\| Boolean\(scopeReason\)\}/);
  // A recusa aparece por extenso, não só como title.
  assert.match(painel, /data-testid="architect-formation-selection-count"/);
});

test("§11 — a autoridade de seleção não alcança motor, DNA, SERP nem Silo", () => {
  /*
   * O critério é o que o módulo IMPORTA, não as palavras que ele escreve: a
   * recusa cita a fase Silos de propósito, porque é para lá que a pessoa
   * precisa ir. O que ela não pode é depender de nada disso para decidir.
   */
  const autoridade = readFileSync("lib/arquiteto/article-selection-scope.ts", "utf8");
  assert.doesNotMatch(autoridade, /^\s*import\s/m, "a autoridade é domínio puro: ela não importa nada");
  // E ela decide só por `candidateRef` — nunca por artefato, versão ou estado.
  assert.doesNotMatch(autoridade, /articleDna|versionId|approved|siloId|serpGate/i);
});
