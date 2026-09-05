import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const pages = readFileSync("modules/arquiteto/article-silo-rows.tsx", "utf8");

/**
 * HOTFIX CRÍTICO: a hierarquia organiza a planilha; ela não substitui nada.
 *
 * O corte anterior criou um detalhe simplificado por cima do detail rico que já
 * existia e apagou a grade. Estes testes travam o inverso: a linha do Article
 * é a de sempre, e SiloPage e publicado entram como pages selecionáveis.
 */

/* ------------------- a linha original do Article voltou ------------------ */

test("a aba Artigos volta a emitir a linha original, agora agrupada", () => {
  // O gate que desligava a lista em Artigos saiu.
  assert.match(workspace, /\(workspaceMode === "silos" \? \[\] : groupedArticles\)\.map/);
  assert.doesNotMatch(workspace, /workspaceMode === "silos" \|\| workspaceMode === "articles" \? \[\] : groupedArticles/);
  // A linha do Article continua sendo a memoizada de sempre, com o detalhe.
  assert.match(workspace, /<MemoizedArticleRow/);
  assert.match(workspace, /Resumo do artigo/);
  assert.match(workspace, /Definição e fatos/);
});

test("nenhum detalhe de Article foi recriado em paralelo", () => {
  // O "DNA DO ARTICLE" simplificado deixou de existir.
  assert.doesNotMatch(pages, /DNA do Article/i);
  assert.doesNotMatch(pages, /architect-article-dna/);
  // O componente novo não emite linha de Article nenhuma.
  assert.doesNotMatch(pages, /architect-article-row/);
});

test("o agrupamento é por SiloPage e preserva a linha de sempre", () => {
  const inicio = workspace.indexOf('if (workspaceMode === "articles") {');
  const corpo = workspace.slice(inicio, workspace.indexOf("return [...grupos.values()]", inicio));
  assert.match(corpo, /articleSiloViews\.map\(view => \[view\.siloRef, view\]\)/);
  assert.match(corpo, /mainKeywordObj\?\.territoryRef/);
  // Article sem Silo resolvido não some da mesa.
  assert.match(corpo, /ARTIGOS SEM SILO/);
});

/* --------------------- SiloPage e publicado são pages -------------------- */

test("a SiloPage é row selecionável, não cabeçalho decorativo", () => {
  assert.match(pages, /data-unit-type="silo_page"/);
  assert.match(pages, /data-silo-page-selection-id=\{`silo-page:\$\{view\.siloRef\}`\}/);
  assert.match(pages, /type="checkbox"/);
  // A identidade é o territoryRef real, nunca um articleId fabricado — e a
  // asserção precisa olhar o código, não o comentário que explica a regra.
  const codigo = pages
    .split("\n")
    .filter(line => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    })
    .join("\n");
  assert.doesNotMatch(codigo, /articleId/);
});


test("as unidades são visualmente distintas", () => {
  assert.match(pages, /SILOPAGE/);
  // Article, publicado e candidato são rotulados na própria linha original —
  // e publicado só existe quando o Minerador entrega a keyword publicada.
  assert.match(workspace, /"ARTICLE · PUBLICADO" : articleDnaVersion \? "ARTICLE" : "CANDIDATO"/);
  assert.doesNotMatch(workspace, /Artigo em formação/);
});

/* ----------------------------- DNA da SiloPage --------------------------- */

test("a SiloPage tem DNA próprio, sem copiar o do Article", () => {
  assert.match(pages, /data-testid="architect-silopage-dna"/);
  for (const secao of ["Identidade", "Página", "Estrutura", "Governança"]) {
    assert.ok(pages.includes(secao), `falta a seção ${secao} no DNA da SiloPage`);
  }
  // Nada de inventar H1/meta que o artefato não tem.
  assert.doesNotMatch(pages, /seoTitle|metaDescription|<h1/i);
});

test("SiloPage projetada mostra a página projetada, não 'sem página definida'", () => {
  assert.match(pages, /Página projetada/);
  assert.match(pages, /data-testid="architect-silopage-canonical-state"/);
  assert.match(pages, /ainda não criada/);
});


/* ------------------------- o que não pode ter sumido --------------------- */

test("painel, mapa e pendências continuam onde estavam", () => {
  assert.match(workspace, /<ArticleFormationPanel/);
  assert.match(workspace, /articleFlow=\{workspaceMode === "articles" \? articleFlow : null\}/);
  // As pendências seguem fora da grade.
  assert.doesNotMatch(workspace, /workspaceMode === "articles" && <ArticlePipelineRows/);
});

test("o hotfix é projeção: nenhuma escrita, nenhuma versão nova", () => {
  assert.doesNotMatch(pages, /persistArquitetoArtifact|createVersionEnvelope|fetch\(/);
});

test("as keywords não viram rows principais nesta aba", () => {
  // Elas moram no detalhe do Article, que é o componente original.
  assert.doesNotMatch(pages, /keywords\.map\(item => \(\s*<tr/);
});
