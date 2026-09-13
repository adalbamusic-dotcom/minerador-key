import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveFormationSelectionScope } from "../lib/arquiteto/article-selection-scope.ts";

/**
 * FASE 1: O PROCESSAMENTO FECHA, O HUMANO CONFIRMA O RESULTADO.
 *
 * Não deve ser preciso resolver keyword por keyword para conseguir formar um
 * ArticleDNA. Os controles manuais continuam existindo — como ajuste, não como
 * requisito.
 */

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const review = readFileSync("modules/arquiteto/article-formation-review.tsx", "utf8");

/* ============== A e B · uma autoridade de seleção ====================== */

test("A · o que a planilha mostra selecionado é o que a ação recebe", () => {
  const escopo = resolveFormationSelectionScope({
    selectedArticleIds: new Set(["a1"]),
    articles: [
      { id: "a1", candidateRef: "cand:1", keywordPrincipal: "skin care principia" },
      { id: "a2", candidateRef: "cand:2", keywordPrincipal: "outro" },
    ],
  });
  assert.equal(escopo.selectedCount, 1);
  assert.equal(escopo.candidateRefs.size, 1);
  assert.equal(escopo.ok, true);
  assert.equal(escopo.reason, null);
});

test("B · linha selecionada fora do cenário é NOMEADA, não silenciada", () => {
  /*
   * O bug do print: rodapé dizia "1 artigo selecionado" e a ação respondia
   * "Selecione pelo menos um artigo" — uma recusa que nenhum clique resolve.
   */
  const escopo = resolveFormationSelectionScope({
    selectedArticleIds: new Set(["a1"]),
    articles: [{ id: "a1", candidateRef: null, keywordPrincipal: "skin care principia" }],
  });
  assert.equal(escopo.selectedCount, 1);
  assert.equal(escopo.ok, false);
  assert.match(escopo.reason!, /1 artigo\(s\) selecionado\(s\)/);
  assert.match(escopo.reason!, /skin care principia/, "a pessoa precisa saber QUAL linha não participa");
  assert.ok(!escopo.reason!.startsWith("Selecione pelo menos um artigo"));
  assert.deepEqual(escopo.excluded.map(item => item.label), ["skin care principia"]);
});

test("B2 · seleção vazia continua sendo seleção vazia", () => {
  const escopo = resolveFormationSelectionScope({ selectedArticleIds: new Set(), articles: [] });
  assert.equal(escopo.ok, false);
  assert.equal(escopo.reason, "Selecione pelo menos um artigo.");
});

test("A/B · processar e concluir leem o MESMO escopo", () => {
  /*
   * A leitura acontece no CLIQUE, por ref, e não na renderização que criou o
   * handler: as listas de dependência dos dois `useCallback` não citavam a
   * memo, e eles ficavam congelados no escopo de quando nasceram. O painel
   * mostrava "1 artigo selecionado" e o handler recusava com "Selecione pelo
   * menos um artigo" — o mesmo estado, lido em dois instantes diferentes.
   *
   * O portão continua sendo UM. O que mudou foi de onde ele é lido.
   */
  const usos = workspace.split("} = formationScopeRef.current;").length - 1;
  assert.equal(usos, 2, "reprocessar e concluir precisam do mesmo portão");
  assert.match(workspace, /resolveFormationSelectionScope\(\{ selectedArticleIds, articles: articlesList \}\)/);
  assert.match(workspace, /const selectedCandidateRefs = formationSelectionScope\.candidateRefs;/);
  // A leitura antiga, que divergia do rodapé, não pode voltar.
  assert.ok(!workspace.includes("selectedCandidateRefsOf({ selectedArticleIds"));
});

/* ============== G · o rótulo não anuncia ato que não houve ============= */

test("G · 'Formação concluída' não aparece antes do ato final", () => {
  assert.match(review, /data-testid="architect-formation-phase-label"/);
  assert.match(review, /\? "ArticleDNA aprovado"/);
  assert.match(review, /"Formação processada · falta concluir"/);
  assert.match(review, /"Formação em processamento"/);
  // O rótulo antigo dizia "Formação concluída" só por existir ArticleDNA,
  // mesmo com a versão em `proposed`.
  assert.ok(!review.includes(`{materialized ? "Formação concluída" : "Revisão da formação"}`));
});

/* ============== §7 · controles manuais saem do caminho ================= */

test("os ajustes manuais saem da tela, sem serem apagados", () => {
  /*
   * §5 — ADVANCED_MANUAL_CONTROLS_VISIBLE = NO. A fase 1 homologa o fluxo
   * automático; os controles continuam implementados e testados, mas fora do
   * caminho básico. Trocar a constante por estado devolve todos eles.
   */
  assert.match(review, /const advancedOpen = false;/);
  assert.match(review, /hidden=\{!advancedOpen\}/);
  assert.ok(!review.includes("architect-review-advanced-toggle"), "o botão sai do caminho básico");
  // Nada foi removido: os controles continuam existindo.
  for (const controle of ["architect-review-make-principal", "architect-review-set-role",
    "architect-review-split", "architect-review-remove", "architect-review-move"]) {
    assert.ok(review.includes(controle), `o controle ${controle} não pode ser apagado`);
  }
});

/* ============== I e §13 · nenhum segundo approval ====================== */

test("I · não existe segundo approval nem etapa intermediária", () => {
  assert.ok(!workspace.includes(`<option value="submit_for_approval"`));
  assert.ok(!workspace.includes(`<option value="approve"`));
  assert.ok(!workspace.includes("const handleConfirmArticleArchitecture"));
  assert.ok(!workspace.includes("const consolidateArticleArchitecture"));
  assert.match(workspace, /await materializeApprovedArticleDnas\(plano\.approved\)/);
});

/* ============== F · Silo não vira conflito da aba Artigos ============== */

test("F · Artigos não inventa conflito territorial próprio", () => {
  const leitura = workspace.slice(
    workspace.indexOf("const articleConflictsFor"),
    workspace.indexOf("const articleParentFor"),
  );
  assert.ok(!leitura.includes("detectArchitectureConflicts"), "o agrupamento provisório não decide conflito de artigo");
  assert.match(leitura, /universe\.candidates\.find\(item => item\.candidateRef === input\.candidateRef\)/);
});
