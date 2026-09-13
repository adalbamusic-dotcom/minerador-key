import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ArticleDNA } from "../lib/arquiteto/contracts.ts";
import { applyWorkingCopyRestore, planWorkingCopyRestore } from "../lib/arquiteto/working-copy-restore.ts";

/**
 * REPROCESSAR REPRODUZ; RESTAURAR CONSERTA.
 *
 * O incremental preserva a estrutura corrente — é isso que ele deve fazer. Por
 * isso ele não recupera um cenário contaminado, e `Confirmar arquitetura`
 * propõe "sem mudança" sobre um drift antigo: a cópia de trabalho já concorda
 * consigo mesma. O baseline da restauração é o ARTEFATO APROVADO.
 */

const CONSOLIDADO_OLEOSA = "territory:6d8facce-fac9-41fc-a242-03cf0480469b";
const CANDIDATE_OLEOSA = "territory:c471899d";
const CONSOLIDADO_RETINOL = "territory:cdd03d6c-51e6-4286-a716-a1f39b7fad19";
const CANDIDATE_RETINOL = "territory:17a6da12";

const artigo = (overrides: Partial<ArticleDNA>): { versionNumber: number; payload: ArticleDNA } => ({
  versionNumber: 5,
  payload: {
    articleId: "article:1",
    principalKeywordId: "kw-principal",
    secondaryKeywordIds: [],
    narrativeReinforcementIds: [],
    territoryRef: CONSOLIDADO_OLEOSA,
    ...overrides,
  } as unknown as ArticleDNA,
});

/** O caso real do acervo: 2 Articles, 3 keywords fora do lugar. */
const casoReal = () => planWorkingCopyRestore({
  approvedArticles: [
    artigo({
      articleId: "article-formation:pele-oleosa",
      principalKeywordId: "kw-pele-oleosa",
      secondaryKeywordIds: ["kw-para-peles-oleosas", "kw-rosto"],
      territoryRef: CONSOLIDADO_OLEOSA,
    }),
    artigo({
      articleId: "article-candidate:retinol",
      principalKeywordId: "kw-retinol-antes-depois",
      secondaryKeywordIds: ["kw-retinol-da-creamy", "kw-vitamina-c"],
      territoryRef: CONSOLIDADO_RETINOL,
    }),
  ],
  territoryByKeywordId: new Map([
    ["kw-pele-oleosa", CANDIDATE_OLEOSA],
    ["kw-para-peles-oleosas", CANDIDATE_OLEOSA],
    ["kw-rosto", CONSOLIDADO_OLEOSA],
    ["kw-retinol-antes-depois", CONSOLIDADO_RETINOL],
    ["kw-retinol-da-creamy", CANDIDATE_RETINOL],
    ["kw-vitamina-c", CONSOLIDADO_RETINOL],
  ]),
  labelByKeywordId: new Map([
    ["kw-pele-oleosa", "skin care pele oleosa"],
    ["kw-para-peles-oleosas", "skin care para peles oleosas"],
    ["kw-rosto", "skin care rosto"],
    ["kw-retinol-antes-depois", "retinol creamy antes e depois"],
    ["kw-retinol-da-creamy", "retinol da creamy"],
    ["kw-vitamina-c", "vitamina c principia antes e depois"],
  ]),
  labelByTerritoryRef: new Map([
    [CONSOLIDADO_OLEOSA, "Skin care para peles oleosas"],
    [CANDIDATE_OLEOSA, "Pele Oleosa e Acne"],
    [CONSOLIDADO_RETINOL, "Anti-idade e Retinol"],
    [CANDIDATE_RETINOL, "Anti-idade e Retinol [candidate]"],
  ]),
});

/* ========================= §4 · o caso real =========================== */

test("§4 · detecta exatamente as 3 atribuições erradas, agrupadas por Article", () => {
  const plano = casoReal();
  assert.equal(plano.articlesAffected, 2);
  assert.equal(plano.keywordsToRestore, 3);
  assert.equal(plano.clean, false);

  const oleosa = plano.articles.find(item => item.articleId === "article-formation:pele-oleosa")!;
  assert.deepEqual(oleosa.keywords.map(item => item.label).sort(),
    ["skin care para peles oleosas", "skin care pele oleosa"]);
  assert.equal(oleosa.keywords[0].currentTerritoryLabel, "Pele Oleosa e Acne");
  assert.equal(oleosa.keywords[0].approvedTerritoryLabel, "Skin care para peles oleosas");
  // "1/3 → 3/3": a keyword já alinhada conta, e é isso que a tela mostra.
  assert.equal(oleosa.alignedBefore, 1);
  assert.equal(oleosa.keywordCount, 3);

  const retinol = plano.articles.find(item => item.articleId === "article-candidate:retinol")!;
  assert.deepEqual(retinol.keywords.map(item => item.label), ["retinol da creamy"]);
  assert.equal(retinol.keywords[0].currentTerritoryLabel, "Anti-idade e Retinol [candidate]");
  assert.equal(retinol.keywords[0].approvedTerritoryLabel, "Anti-idade e Retinol");
});

test("cópia de trabalho já alinhada não propõe nada", () => {
  const plano = planWorkingCopyRestore({
    approvedArticles: [artigo({ principalKeywordId: "kw-a" })],
    territoryByKeywordId: new Map([["kw-a", CONSOLIDADO_OLEOSA]]),
    labelByKeywordId: new Map([["kw-a", "keyword"]]),
  });
  assert.equal(plano.clean, true);
  assert.match(plano.summary, /nada a restaurar/);
});

test("artigo aprovado sem território fica de fora: não há para onde restaurar", () => {
  const plano = planWorkingCopyRestore({
    approvedArticles: [artigo({ principalKeywordId: "kw-a", territoryRef: undefined } as unknown as Partial<ArticleDNA>)],
    territoryByKeywordId: new Map([["kw-a", CANDIDATE_OLEOSA]]),
    labelByKeywordId: new Map([["kw-a", "keyword"]]),
  });
  assert.equal(plano.clean, true, "inventar território seria decidir no lugar de alguém");
});

test("keyword que a cópia de trabalho não conhece não é drift", () => {
  const plano = planWorkingCopyRestore({
    approvedArticles: [artigo({ principalKeywordId: "kw-a", secondaryKeywordIds: ["kw-sumida"] })],
    territoryByKeywordId: new Map([["kw-a", CONSOLIDADO_OLEOSA]]),
    labelByKeywordId: new Map([["kw-a", "keyword"]]),
  });
  assert.equal(plano.clean, true, "ausência não vira vínculo novo");
});

/* ========================= §7 · aplicação atômica ===================== */

test("§7 · aplica as 3 ou nenhuma", async () => {
  const aplicadas: string[] = [];
  const resultado = await applyWorkingCopyRestore({
    plan: casoReal(),
    assign: async item => { aplicadas.push(item.keywordId); },
    revert: async () => { throw new Error("não deveria desfazer"); },
  });
  assert.equal(resultado.state, "restored");
  assert.equal(resultado.applied, 3);
  assert.equal(aplicadas.length, 3);
  assert.match(resultado.message, /auditoria de drift/);
});

test("§7 · falha no meio desfaz o que já foi aplicado", async () => {
  const aplicadas: string[] = [];
  const desfeitas: string[] = [];
  const resultado = await applyWorkingCopyRestore({
    plan: casoReal(),
    assign: async item => {
      if (aplicadas.length === 2) throw new Error("42501: permissão negada");
      aplicadas.push(item.keywordId);
    },
    revert: async item => { desfeitas.push(item.keywordId); },
  });
  assert.equal(resultado.state, "failed");
  assert.equal(resultado.applied, 0, "não existe restauração pela metade");
  assert.equal(desfeitas.length, 2, "o que foi aplicado precisa voltar");
  assert.match(resultado.message, /42501/);
});

test("§7 · o que não pôde ser desfeito é NOMEADO", async () => {
  const resultado = await applyWorkingCopyRestore({
    plan: casoReal(),
    assign: async item => { if (item.label === "retinol da creamy") throw new Error("falha"); },
    revert: async () => { throw new Error("também falhou"); },
  });
  assert.equal(resultado.state, "failed");
  assert.match(resultado.message, /Não foi possível desfazer/);
});

test("plano limpo não chama nada", async () => {
  const resultado = await applyWorkingCopyRestore({
    plan: planWorkingCopyRestore({ approvedArticles: [], territoryByKeywordId: new Map(), labelByKeywordId: new Map() }),
    assign: async () => { throw new Error("não deveria aplicar"); },
    revert: async () => { throw new Error("não deveria desfazer"); },
  });
  assert.equal(resultado.state, "clean");
});

/* ================= §5 · restauração não toca no ArticleDNA ============ */

/* ============ §6/§15 · a tela e o escopo ============================== */

test("§6 · a aba Silos oferece a restauração com preview antes de gravar", () => {
  const painel = readFileSync("modules/arquiteto/architecture-panel.tsx", "utf8");
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(painel, /data-testid="architect-restore-working-copy"/);
  assert.match(painel, /data-testid="architect-restore-preview"/);
  assert.match(painel, /data-testid="architect-restore-action"/);
  assert.match(painel, /ARTICLES_AFETADOS = \{restore\.plan\.articlesAffected\} · KEYWORDS_A_RESTAURAR = \{restore\.plan\.keywordsToRestore\}/);
  // O primeiro clique abre o preview; nada é gravado nele.
  assert.match(workspace, /if \(!restorePreviewOpen\) \{/);
  assert.match(workspace, /Nada foi gravado: confirme novamente para restaurar/);
  // E o texto diz por que Reprocessar não resolve isso.
  assert.match(painel, /Reprocessar não conserta isto/);
});

test("§15 · o painel de formação lê o escopo da autoridade única", () => {
  const painel = readFileSync("modules/arquiteto/article-formation-panel.tsx", "utf8");
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  // Nenhuma contagem própria: o motivo vem pronto.
  assert.ok(!painel.includes("selectedCount === 0"), "o painel não pode recalcular a recusa");
  assert.match(painel, /scopeReason: string \| null;/);
  assert.match(workspace, /scopeReason=\{formationSelectionScope\.reason\}/);
  assert.match(workspace, /selectedCount=\{formationSelectionScope\.selectedCount\}/);
  // E o lote de fechamento passa pela MESMA autoridade, lida no clique.
  assert.ok(workspace.includes("const escopoDoFechamento = formationScopeRef.current.scope;"));
  assert.ok(workspace.includes('escopoDoFechamento.reason ?? "Selecione pelo menos um artigo."'));
});

test("§14 · Reprocessar fecha a conta em vez de dizer que nada aconteceu", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  // O resumo é o da SELEÇÃO: contar o lote fazia a mesa dizer "5 analisados"
  // para quem tinha marcado um.
  assert.match(workspace, /Processamento concluído: \$\{resumoDaFormacao\.candidates\} Article\(s\) analisado\(s\)/);
  assert.match(workspace, /\$\{prontos\} pronto\(s\) para concluir/);
  assert.match(workspace, /const prontos = Math\.max\(g\.total - g\.blocking, 0\)/);
});

test("§5 · a restauração não edita artefato, não sucede e não chama provider", () => {
  const fonte = readFileSync("lib/arquiteto/working-copy-restore.ts", "utf8");
  for (const proibido of ["persistArquitetoArtifact", "createVersionEnvelope", "confirmSerpValidation", "fetch("]) {
    assert.ok(!fonte.includes(proibido), `a restauração não pode chamar ${proibido}`);
  }
  assert.match(fonte, /não edita ArticleDNA, não cria sucessora, não aprova nada/);
  assert.match(fonte, /não reagrupa por similaridade/);
});
