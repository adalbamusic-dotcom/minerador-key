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

/*
 * 2026-10-16 · pedido do dono ("mostra só o que é útil para o user"): o
 * cabeçalho "Workbench do Arquiteto" com as contagens SiloPage/Article/
 * candidato/publicado saiu da aba Artigos. A distinção continua no domínio
 * (`summarizeArticleSiloViews`) e na mesa (a SiloPage é a linha-pai).
 */
test("a aba Artigos não tem o cabeçalho de contagens; a SiloPage continua sendo a linha-pai, não um Article", () => {
  assert.match(workbench, /\{mode !== "articles" && <div className="flex flex-wrap items-center justify-between gap-3">/);
  assert.doesNotMatch(workbench, /SiloPage\(s\)|Article\(s\) formado\(s\)|articleScope/);
  assert.doesNotMatch(workspace, /articleScope=\{/);
  assert.match(workspace, /<ArticleSiloPageRow/);
  assert.match(workspace, /summarizeArticleSiloViews\(articleSiloViews\)/);
});

/* ----------------------------- §5 rótulos -------------------------------- */

test("o rótulo da unidade diz o que ela é, sem 'Artigo em formação'", () => {
  // O rótulo passou a vir de `readFormationConclusionState`: o ternário inline
  // sobre "existe ArticleDNA?" não sabia distinguir formação concluída de
  // formação aberta, e chamava as duas de "ainda não confirmado".
  assert.ok(workspace.includes("const formacao = readFormationConclusionState({"));
  assert.ok(workspace.includes("{formacao.unitLabel}"));
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

/*
 * 2026-10-16 · §8 e §9 na tela saíram (pedido do dono: "mostra só o que é
 * útil para o user"): a leitura por Silo era só contagem (Keywords, Articles,
 * Candidatos, Singletons, Agrupamentos, sobreposições) e o alerta de
 * fragmentação não levava a nenhuma ação. O que pede decisão continua: as
 * formações que precisam de revisão e o artigo aberto com o "Por quê?".
 */
test("o painel não tem mais a leitura por Silo em contagens nem o alerta de fragmentação; diz o que precisa de revisão", () => {
  for (const fora of ["architect-silo-panel", "Singletons:", "Agrupamentos:", "architect-fragmentation-alert", "architect-fragmentation-explanation"]) {
    assert.ok(!panel.includes(fora), `${fora} saiu do painel`);
  }
  assert.match(panel, /formação\(ões\) precisa\(m\) de revisão/);
  assert.match(panel, /Por quê\?/);
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

test("os gráficos de distribuição e composição saíram do painel (2026-10-16)", () => {
  assert.ok(!panel.includes("architect-chart-silo-distribution"));
  assert.ok(!panel.includes("Distribuição da formação"));
  assert.ok(!panel.includes("architect-chart-composition"));
});

/* ---------------------------- §13 React Flow ----------------------------- */

test("a aba Artigos não tem mais mapa (2026-10-16: o React Flow fica só em Links internos)", () => {
  assert.doesNotMatch(workspace, /articleFlow=\{/);
  assert.match(workspace, /\{linksMode && <div className="min-h-0 min-w-0 overflow-hidden p-0">/);
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

test("sem mapa na aba Artigos, o artigo abre pelo 'Abrir artigo' da análise por keyword (e a composição segue na linha da tabela)", () => {
  // 2026-10-16 · o clique no mapa saiu com o mapa; o mesmo nó abre pelo handler de sempre da análise.
  const trecho = workspace.slice(workspace.indexOf("onOpenArticle: (siloRef: string, principalKeywordId: string) => {"));
  const corpo = trecho.slice(0, trecho.indexOf("\n    },"));
  assert.match(corpo, /setSelectedArticleNodeRef\(candidateRef\)/);
  assert.doesNotMatch(workspace, /setPanelSiloRef/);
  assert.match(workspace, /<ArticleFormationReviewPanel/);
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
