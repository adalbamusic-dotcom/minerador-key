import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertSelectionScope,
  scopeFormationUniverses,
  selectedCandidateRefsOf,
} from "../lib/arquiteto/article-selection-scope.ts";
import { buildArticleFormationConfirmationPlan } from "../lib/arquiteto/article-formation-confirmation.ts";

/**
 * SELEÇÃO É ESCOPO — §17.
 *
 * A mesa dizia "1 artigo precisa de decisão humana" apontando para um Article
 * que o humano não tinha selecionado. O gate olhava o lote; a pessoa olhava a
 * seleção. Aqui a regra é exercida, não afirmada no comentário.
 */

const candidato = (ref: string, extra: Record<string, unknown> = {}) => ({
  candidateRef: ref,
  keywords: [{ keywordId: `${ref}:kw`, role: "principal" as const }],
  overflowKeywordIds: [],
  principalKeywordId: `${ref}:kw`,
  suggestedSlug: ref,
  origin: "logic" as const,
  conflicts: [] as string[],
  ...extra,
});

const universo = (siloRef: string, refs: string[]) => ({
  siloRef,
  siloLabel: siloRef,
  candidates: refs.map(ref => candidato(ref)),
  publishedArticles: [],
});

/* --------------------- G) sem seleção não há escopo ---------------------- */

test("nenhum Article selecionado: os dois botões ficam sem escopo", () => {
  const veredito = assertSelectionScope(new Set());
  assert.equal(veredito.ok, false);
  if (veredito.ok) return;
  assert.equal(veredito.reason, "Selecione pelo menos um artigo.");

  // E o recorte devolve VAZIO — nunca "tudo".
  const recorte = scopeFormationUniverses({
    universes: [universo("silo:1", ["a", "b"]), universo("silo:2", ["c"])],
    selectedCandidateRefs: new Set(),
  });
  assert.deepEqual(recorte, [], "seleção vazia jamais pode significar o lote inteiro");
});

/* ---------- H) Article fora da seleção não entra e não bloqueia ---------- */

test("Article não selecionado não participa nem é alterado", () => {
  const universos = [universo("silo:1", ["a", "b"]), universo("silo:2", ["c"])];
  const recorte = scopeFormationUniverses({
    universes: universos,
    selectedCandidateRefs: new Set(["b"]),
  });

  assert.equal(recorte.length, 1, "universo sem candidato selecionado sai inteiro");
  assert.equal(recorte[0].siloRef, "silo:1");
  assert.deepEqual(recorte[0].candidates.map(item => item.candidateRef), ["b"]);

  // O original permanece intocado: recortar é leitura, não mutação.
  assert.deepEqual(universos[0].candidates.map(item => item.candidateRef), ["a", "b"]);
  assert.equal(universos.length, 2);
});

/* ------- A/B) pendência de quem não foi selecionado não bloqueia --------- */

test("A) pendência de Article NÃO selecionado não barra o selecionado", () => {
  // `c` tem conflito humano aberto; `b` está limpo. O humano seleciona `b`.
  const universos = [
    universo("silo:1", ["b"]),
    { ...universo("silo:2", ["c"]), candidates: [candidato("c", { conflicts: ["SERP inconclusiva ainda sem decisao humana"] })] },
  ];

  const planoDoLote = buildArticleFormationConfirmationPlan({ universes: universos as never });
  const planoDaSelecao = buildArticleFormationConfirmationPlan({
    universes: scopeFormationUniverses({ universes: universos, selectedCandidateRefs: new Set(["b"]) }) as never,
  });

  // O lote enxerga os dois; a seleção enxerga um. É essa diferença que fazia a
  // mesa reclamar de artigo que ninguém escolheu.
  assert.ok(planoDoLote.approved.length + planoDoLote.blocked.length > planoDaSelecao.approved.length + planoDaSelecao.blocked.length);
  const refsDaSelecao = [...planoDaSelecao.approved, ...planoDaSelecao.blocked].map(item => item.candidateRef);
  assert.deepEqual(refsDaSelecao, ["b"], "só o selecionado é avaliado");
});

test("B) selecionar o pendente traz a pendência DELE, e só dela", () => {
  const universos = [
    universo("silo:1", ["b"]),
    { ...universo("silo:2", ["c"]), candidates: [candidato("c", { conflicts: ["SERP inconclusiva ainda sem decisao humana"] })] },
  ];
  const plano = buildArticleFormationConfirmationPlan({
    universes: scopeFormationUniverses({ universes: universos, selectedCandidateRefs: new Set(["c"]) }) as never,
  });
  const refs = [...plano.approved, ...plano.blocked].map(item => item.candidateRef);
  assert.deepEqual(refs, ["c"]);
});

/* --------------------- a ponte tabela → candidateRef --------------------- */

test("a seleção da tabela vira candidateRef, ignorando linha sem candidato", () => {
  const refs = selectedCandidateRefsOf({
    selectedArticleIds: new Set(["row-1", "row-3", "row-ausente"]),
    articles: [
      { id: "row-1", candidateRef: "cand-1" },
      { id: "row-2", candidateRef: "cand-2" },
      // Linha publicada, sem candidato de formação: não vira escopo.
      { id: "row-3", candidateRef: null },
    ],
  });
  assert.deepEqual([...refs], ["cand-1"]);
});

/* --------------------------- a fiação da tela ---------------------------- */

test("o painel e os handlers usam o mesmo escopo", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const painel = readFileSync("modules/arquiteto/article-formation-panel.tsx", "utf8");

  assert.match(workspace, /scopeFormationUniverses\(\{ universes: articleFormationUniverses, selectedCandidateRefs \}\)/);
  assert.match(workspace, /selectedCandidateRefsOf\(\{ selectedArticleIds, articles: articlesList \}\)/);
  // Os dois atos recusam antes de trabalhar, com a frase do domínio.
  const recusas = workspace.match(/assertSelectionScope\(selectedCandidateRefs\)/g) || [];
  assert.equal(recusas.length, 2, "processar e concluir precisam do mesmo portão");
  // E a barra diz o escopo por extenso.
  assert.match(painel, /data-testid="architect-formation-selection-count"/);
  assert.match(painel, /selectedCount === 0/);
});
