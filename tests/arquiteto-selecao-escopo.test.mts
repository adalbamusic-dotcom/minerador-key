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

/* ------------- a resolução humana da SERP existe de verdade -------------- */

test("a decisão humana da SERP tem UI, handler, remoto e readback", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const review = readFileSync("modules/arquiteto/article-formation-review.tsx", "utf8");

  // O botão existe e exige motivo — decisão sem justificativa não é decisão.
  assert.match(review, /Manter composição/);
  assert.match(review, /disabled=\{busy \|\| serpReason\.trim\(\)\.length < 8\}/);

  // O handler grava no remoto...
  assert.match(workspace, /const acceptSerpForCandidate = useCallback/);
  assert.match(workspace, /"\/api\/arquiteto\/serp-resolution"/);
  assert.match(workspace, /decision: "accept_current_composition"/);

  // ...e o READBACK é quem encerra: a decisão precisa voltar amarrada à MESMA
  // base sobre a qual foi tomada, senão é decisão sobre outra composição.
  assert.match(workspace, /const canonical = await loadCanonicalArquitetoWorkspace\(selectedBrandId\);/);
  assert.match(workspace, /confirmado\?\.formationBaseHash !== registro\.formationBaseHash/);
  assert.match(workspace, /A decisão não foi confirmada pelo remoto/);
});

/* -------- §9: composição só muda por proposta, nunca por clique ---------- */

test("os controles de composição do painel entram como PROPOSTA", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

  /*
   * O split acidental de "skin care rosto" aconteceu porque o painel gravava
   * na working copy remota no primeiro clique, enquanto os MESMOS atos, na
   * revisão, passavam por "Ver efeito" e "Aplicar". Uma exploração virou
   * composição ativa, e a SERP seguinte foi coletada para o artigo errado.
   */
  assert.match(workspace, /onChangePrincipal=\{\(candidateRef, keywordId\) => setPendingScenarioChange\(\{ kind: "change_principal"/);
  assert.match(workspace, /onSplitKeyword=\{\(candidateRef, keywordId\) => setPendingScenarioChange\(\{ kind: "split_keyword"/);
  assert.match(workspace, /onMergeCandidates=\{\(left, right\) => setPendingScenarioChange\(\{ kind: "merge_candidates"/);
  assert.match(workspace, /kind: "move_keyword", keywordId, fromCandidateRef: origem\.candidateRef/);

  // Nenhum dos quatro pode voltar a mutar direto do painel.
  assert.doesNotMatch(workspace, /onSplitKeyword=\{\(candidateRef, keywordId\) => \{ void splitKeywordFromCandidate/);
  assert.doesNotMatch(workspace, /onChangePrincipal=\{\(candidateRef, keywordId\) => \{ void changeCandidatePrincipal/);
  assert.doesNotMatch(workspace, /onMergeCandidates=\{\(left, right\) => \{ void mergeCandidates/);

  // E aplicar continua sendo ato à parte, com recusa respeitada.
  assert.match(workspace, /if \(!change \|\| scenarioPreview\?\.refusal\) return;/);
});
