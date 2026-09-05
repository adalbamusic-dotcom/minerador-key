import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const panel = readFileSync("modules/arquiteto/article-formation-panel.tsx", "utf8");
const rows = readFileSync("modules/arquiteto/article-silo-rows.tsx", "utf8");
const workbench = readFileSync("modules/arquiteto/arquiteto-workbench.tsx", "utf8");

/* ------------------- §2/§3 a raiz é a SiloPage, mesma mesa --------------- */

test("a aba Artigos agrupa por SiloPage sem perder a linha original", () => {
  // A linha de Article é a de sempre; o que muda é a ordem e o cabeçalho.
  assert.match(workspace, /<MemoizedArticleRow/);
  assert.match(workspace, /<ArticleSiloPageRow/);
  assert.match(workspace, /\(workspaceMode === "silos" \? \[\] : groupedArticles\)\.map/);
});

test("nenhuma rota, aba ou workspace novo foi criado para SiloPage", () => {
  assert.doesNotMatch(rows, /useRouter|href=|<Link/);
  assert.doesNotMatch(rows, /workspaceMode|setWorkspaceMode/);
  // A SiloPage é uma row da MESMA tabela.
  assert.match(rows, /data-testid="architect-silopage-row"/);
  assert.doesNotMatch(rows, /<table/);
});

/* ------------------- §4 SiloPage não conta como Article ------------------ */

test("o cabeçalho distingue SiloPage de Article", () => {
  assert.match(workbench, /data-testid="architect-workbench-counts"/);
  for (const rotulo of ["SiloPage(s)", "Article(s) formado(s)", "candidato(s)", "publicado(s)"]) {
    assert.ok(workbench.includes(rotulo), `o cabeçalho precisa distinguir ${rotulo}`);
  }
  assert.match(workspace, /articleScope=\{workspaceMode === "articles"/);
});

/* ----------------------------- §5 rótulos -------------------------------- */

test("o rótulo da unidade diz o que ela é, sem 'Artigo em formação'", () => {
  assert.match(workspace, /"ARTICLE · PUBLICADO" : articleDnaVersion \? "ARTICLE" : "CANDIDATO"/);
  assert.doesNotMatch(workspace, /Artigo em formação/);
  assert.match(rows, /SILOPAGE/);
});

/* -------------------------- §6 sem seleção automática -------------------- */

test("cada unidade tem checkbox próprio e a seleção nasce vazia", () => {
  // SiloPage e publicado têm identidade de seleção própria.
  assert.match(rows, /data-silo-page-selection-id/);
  // Nenhum estado inicial marca linhas por conta própria.
  assert.match(workspace, /useState<Set<string>>\(new Set\(\)\)/);
});

/* ------------------- §7 pendências saem da grid principal ---------------- */

test("as pendências de Silo saíram da mesa e viraram contagem no painel", () => {
  // A grid não emite mais as seções de espera na aba Artigos.
  assert.doesNotMatch(workspace, /workspaceMode === "articles" && <ArticlePipelineRows/);
  assert.match(panel, /data-testid="architect-waiting-summary"/);
  assert.match(panel, /aguardam confirmação do Silo/);
  assert.match(panel, /ainda não possuem Silo/);
});

test("o detalhe das pendências abre sob demanda, com nome e motivo", () => {
  assert.match(panel, /data-testid="architect-waiting-toggle"/);
  assert.match(panel, /data-testid="architect-waiting-details"/);
  assert.match(panel, /\{row\.keyword\}/);
  assert.match(panel, /\{row\.reason\}/);
});

/* ---------------------------- §8 painel por Silo ------------------------- */

test("o painel permite ler um Silo por vez", () => {
  assert.match(panel, /data-testid="architect-silo-panel"/);
  assert.match(panel, /data-testid="architect-silo-panel-counts"/);
  for (const campo of ["Keywords:", "Articles:", "Candidatos:", "Publicados:", "Singletons:", "Agrupamentos:"]) {
    assert.ok(panel.includes(campo), `falta o campo ${campo} na leitura por Silo`);
  }
});

/* ------------------------ §9 fragmentação visível ------------------------ */

test("a fragmentação aparece como alerta editorial, não como validação", () => {
  assert.match(panel, /data-testid="architect-fragmentation-alert"/);
  assert.match(panel, /Ainda não há\s+evidência suficiente/);
  // Informativo: não desabilita o botão de confirmar.
  const trecho = panel.slice(panel.indexOf("architect-fragmentation-alert"));
  assert.doesNotMatch(trecho.slice(0, 400), /disabled/);
  // O painel diz POR QUE eles continuam separados, em vez de só contar.
  assert.match(panel, /data-testid="architect-fragmentation-explanation"/);
  assert.match(panel, /já desconta o universo do Silo/);
});

/* ----------------------------- §18 slug pobre ---------------------------- */

test("slug pobre continua sendo observação, nunca correção", () => {
  // O alerta vive no domínio; a linha do Article é a original de sempre.
  const view = readFileSync("lib/arquiteto/article-silo-view.ts", "utf8");
  assert.match(view, /SLUG_REVIEW_LABELS/);
  assert.match(view, /reviewSlugQuality/);
  // Observação, não correção: nada de reescrever endereço.
  assert.doesNotMatch(view, /setSlug|persistArquitetoArtifact/);
});

/* ------------------------- §20 gráfico por Silo -------------------------- */

test("a distribuição por Silo é um gráfico do painel", () => {
  assert.match(panel, /data-testid="architect-chart-silo-distribution"/);
  assert.match(panel, /Distribuição da formação/);
  assert.match(panel, /data-testid="architect-chart-composition"/);
});

/* ---------------------------- §13 React Flow ----------------------------- */

test("o mapa da aba Artigos é alimentado pela projeção hierárquica", () => {
  assert.match(workspace, /articleFlow=\{workspaceMode === "articles" \? articleFlow : null\}/);
  assert.match(workbench, /if \(mode === "articles" && articleFlow\) return buildArticleHierarchyFlow/);
  assert.match(workbench, /silo_page: "silo"/);
});

/* ------------------------------ §22 sem v3 ------------------------------- */

test("este corte não cria versão nova de ArticleDNA", () => {
  // Nada em nenhuma peça nova escreve artefato.
  for (const [nome, source] of [["rows", rows], ["panel", panel]] as const) {
    assert.doesNotMatch(source, /persistArquitetoArtifact|createVersionEnvelope/, `${nome} não pode materializar`);
    assert.doesNotMatch(source, /fetch\(/, `${nome} não chama rede`);
  }
  const flow = readFileSync("lib/arquiteto/article-flow.ts", "utf8");
  const view = readFileSync("lib/arquiteto/article-silo-view.ts", "utf8");
  assert.doesNotMatch(flow, /persistArquitetoArtifact|fetch\(/);
  assert.doesNotMatch(view, /persistArquitetoArtifact|fetch\(/);
});

/* --------------------------- §21 SERP não entra -------------------------- */

test("nenhuma peça deste corte chama SERP ou IA", () => {
  for (const source of [rows, panel, readFileSync("lib/arquiteto/article-flow.ts", "utf8")]) {
    assert.doesNotMatch(source, /dataforseo|deepseek/i);
  }
});

/* ------------------------------- §1 escopo ------------------------------- */

test("o cross-silo é auditado e mostrado antes de qualquer número", () => {
  assert.match(workspace, /auditArticleSiloScope\(\{/);
  assert.match(workspace, /crossSilo=\{articleScopeAudit\.crossSilo\}/);
  assert.match(panel, /data-testid="architect-cross-silo-alert"/);
  assert.match(panel, /não pertencem a nenhuma SiloPage/);
});

/* --------------------- §16 sincronia mapa ↔ painel ----------------------- */

test("clicar no mapa abre a mesma leitura da mesa", () => {
  const trecho = workspace.slice(workspace.indexOf("const handleMapStateChange"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  assert.match(corpo, /workspaceMode === "articles"/);
  // SiloPage abre o resumo do Silo; Article e keyword abrem a composição.
  assert.match(corpo, /no\.kind === "silo_page"/);
  assert.match(corpo, /setPanelSiloRef\(no\.siloRef\)/);
  assert.match(corpo, /setSelectedArticleNodeRef\(no\.articleRef\)/);
});

/* ------------------- §17 composição do Article selecionado --------------- */

test("selecionar um Article na mesa abre a composição dele", () => {
  const trecho = workspace.slice(workspace.indexOf("const selectedFormationCandidate"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  // A linha perdeu o checkbox; ler da seleção antiga deixaria o painel mudo.
  assert.match(corpo, /selectedArticleNodeRef/);
  assert.doesNotMatch(corpo, /selectedArticleIds/);
  assert.match(corpo, /candidate\.candidateRef === selectedArticleNodeRef/);
});

test("as quatro ações de revisão têm controle na tela", () => {
  for (const testid of [
    "architect-candidate-make-principal",
    "architect-candidate-split",
    "architect-candidate-move",
    "architect-candidate-merge-apply",
  ]) {
    assert.ok(panel.includes(testid), `falta o controle ${testid}`);
  }
  assert.match(workspace, /onMoveKeyword=\{\(keywordId, targetCandidateRef\)/);
});
