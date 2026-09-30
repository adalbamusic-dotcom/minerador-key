import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ARTICLES_NEW_ANCHOR,
  ARTICLES_SOBRAS_ANCHOR,
  IMPROVEMENT_NOTHING_ANYWHERE_SENTENCE,
  IMPROVEMENT_NO_PENDING_SENTENCE,
  improvementApplyLabel,
  improvementValidateLabel,
  resolveImprovementNextStep,
  type ImprovementNextStepInput,
} from "../lib/arquiteto/article-improvement-next-step.ts";

/**
 * ABA ARTIGOS SIMPLES — a ordem do trabalho na frente, o resto em
 * "Detalhes técnicos". Nenhum comportamento mudou: os mesmos blocos, os
 * mesmos handlers; muda a ordem e o que abre fechado.
 *
 * O cartão "Próximo passo" renderizado está em
 * `arquiteto-article-improvement-dom.test.mts`.
 */

const base: ImprovementNextStepInput = { hasRun: true, state: "prepared", leaseActive: false, accepted: false, paidQueries: 0, costMaxUsd: 0, selectedCount: 0 };

test("próximo passo: uma frase e um botão por estado, na ordem 1 → 2 → 3", () => {
  const sem = resolveImprovementNextStep({ ...base, hasRun: false, state: null });
  assert.deepEqual([sem.kind, sem.button], ["prepare", "1 · Buscar keywords (grátis)"]);
  const validar = resolveImprovementNextStep({ ...base, paidQueries: 2, costMaxUsd: 0.006, selectedCount: 2 });
  assert.deepEqual([validar.kind, validar.button], ["validate", "2 · Validar no Google (2 consultas, até US$ 0.01)"]);
  const gravar = resolveImprovementNextStep({ ...base, selectedCount: 3 });
  assert.deepEqual([gravar.kind, gravar.button], ["apply", "3 · Gravar melhorias (3)"]);
  const nada = resolveImprovementNextStep({ ...base, state: "complete", accepted: true, selectedCount: 2, readyCount: 2, hasLeftovers: true });
  assert.deepEqual([nada.kind, nada.sentence, nada.button, nada.anchorId], ["none", IMPROVEMENT_NO_PENDING_SENTENCE, "Ver Sobras", ARTICLES_SOBRAS_ANCHOR]);
  assert.equal(IMPROVEMENT_NO_PENDING_SENTENCE, "Nada a fazer nos publicados agora. Veja artigos novos em Sobras.");
});

test("sem Sobras, o cartão não manda para um lugar vazio: leva a Artigos novos", () => {
  const passo = resolveImprovementNextStep({ ...base, state: "complete", accepted: true, hasLeftovers: false });
  assert.deepEqual([passo.kind, passo.sentence, passo.button, passo.anchorId], ["none", IMPROVEMENT_NOTHING_ANYWHERE_SENTENCE, "Ir para Artigos novos", ARTICLES_NEW_ANCHOR]);
  assert.doesNotMatch(passo.sentence, /Veja artigos novos em Sobras/);
  // As âncoras existem na aba: Sobras no invólucro do painel, Artigos novos na barra de formação.
  assert.match(fonte, /<div id="architect-sobras" data-testid="architect-articles-sobras">/);
  assert.match(fonte, /<section id="architect-articles-new" [^>]*data-testid="architect-articles-formation-actions">/);
  assert.match(fonte, /hasLeftovers=\{hasLeftoverOpportunities\}/);
  assert.match(fonte, /const hasLeftoverOpportunities = !leftoversDismissed && Boolean\(leftoverOpportunities && \(leftoverOpportunities\.groups\.length \|\| leftoverOpportunities\.withoutVolume\.length\)\);/);
});

test("linhas prontas desmarcadas: o cartão pede a marcação, não diz 'nada a fazer'", () => {
  const passo = resolveImprovementNextStep({ ...base, readyCount: 2, selectedCount: 0, hasLeftovers: true });
  assert.equal(passo.kind, "select");
  assert.match(passo.sentence, /^2 melhoria\(s\) pronta\(s\)\. Marque na tabela abaixo as que quer gravar\.$/);
  assert.equal(passo.button, "3 · Gravar melhorias (0)");
  // Validar continua vindo antes de marcar.
  assert.equal(resolveImprovementNextStep({ ...base, readyCount: 2, paidQueries: 1 }).kind, "validate");
});

test("execução presa vem antes de tudo; retomar é Continuar e só ler o andamento é Ver andamento", () => {
  for (const [entrada, kind, botao] of [
    [{ ...base, state: "collecting", paidQueries: 4 }, "resume_collect", "Continuar"],
    [{ ...base, leaseActive: true, selectedCount: 2 }, "refresh", "Ver andamento"],
    [{ ...base, state: "applying", accepted: true, selectedCount: 2 }, "resume_apply", "Continuar"],
  ] as const) {
    const passo = resolveImprovementNextStep(entrada);
    assert.equal(passo.kind, kind);
    assert.equal(passo.button, botao);
    assert.ok(passo.sentence.length > 0 && passo.sentence.length < 140, "uma frase curta");
  }
});

test("os números 1 · 2 · 3 ficam só no cartão; a fileira mostra os outros atos sem número", () => {
  assert.equal(improvementApplyLabel(2, false), "Gravar melhorias (2)");
  assert.equal(improvementValidateLabel(2, 0.006, false), "Validar no Google (2 consultas, até US$ 0.01)");
  const fileira = painel.slice(painel.indexOf("<div className=\"flex flex-wrap gap-2\">"), painel.indexOf("{confirm && run &&"));
  assert.ok(fileira.length > 0);
  assert.doesNotMatch(fileira, /[123] · /, "nenhum botão numerado na fileira");
  assert.match(fileira, /improvementApplyLabel\(selected\.size, false\)/);
  assert.match(fileira, /Gravar sem validar/);
  // O parágrafo dos três passos fica no InfoHint "Como funciona" (pedido do dono, 2026-09-30), não num bloco aberto.
  assert.match(painel, /<InfoHint title="Como funciona" description="1 · Buscar keywords/);
  assert.doesNotMatch(painel, /<summary className="cursor-pointer">Como funciona<\/summary>/);
});

/* -------------------------------- a ordem da aba ------------------------------ */

const semComentarios = (codigo: string) => codigo
  .split("\n")
  .filter(line => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("/*") && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("{/*"))
  .join("\n");
const fonte = semComentarios(readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8"));
const painel = semComentarios(readFileSync("modules/arquiteto/article-improvement-panel.tsx", "utf8"));

const inicioGrade = fonte.indexOf("const workbenchGrid = (");
const fimGrade = fonte.indexOf("\n  );\n", inicioGrade);
const grade = fonte.slice(inicioGrade, fimGrade);
const tela = fonte.slice(fonte.indexOf("<main className=\"min-w-0 flex-1 overflow-y-auto bg-background\">"), fonte.indexOf("</main>"));

test("na aba Artigos: próximo passo e melhoria, a mesa, Sobras e, no fim, Detalhes técnicos fechado", () => {
  assert.ok(inicioGrade > 0 && fimGrade > inicioGrade, "a grade do Workbench é uma const só");
  const posicoes = [
    tela.indexOf("{articleMode && <ArticleImprovementPanel"),
    tela.indexOf("data-testid=\"architect-articles-formation-actions\""),
    tela.indexOf("data-architect-table=\"articles\""),
    tela.indexOf("data-testid=\"architect-articles-sobras\""),
    tela.indexOf("data-testid=\"architect-articles-technical\""),
  ];
  assert.ok(posicoes.every(posicao => posicao >= 0), JSON.stringify(posicoes));
  assert.deepEqual([...posicoes].sort((a, b) => a - b), posicoes, "a ordem é a do trabalho");
  // O cartão Próximo passo abre o painel de melhoria.
  assert.ok(painel.indexOf("architect-improvement-next-step") < painel.indexOf("<h3"), "o cartão vem antes do título do painel");
  // Detalhes técnicos: um <details> fechado, com a grade inteira dentro.
  const detalhes = tela.slice(tela.indexOf("data-testid=\"architect-articles-technical\"") - 120);
  assert.match(detalhes, /<details className="[^"]*" data-testid="architect-articles-technical">\s*<summary[^>]*>Detalhes técnicos<\/summary>\s*\{workbenchGrid\}\s*<\/details>/);
  assert.doesNotMatch(detalhes.slice(0, 200), /<details[^>]*\bopen\b/);
  // Nas outras abas a grade abre a tela, como antes.
  assert.ok(tela.indexOf("{!articleMode && workbenchGrid}") < tela.indexOf("data-architect-table=\"articles\""));
});

test("nada saiu da tela: os blocos técnicos continuam na grade, e melhoria e Sobras aparecem uma vez só", () => {
  for (const marca of [
    "<ArticleFormationPanel",
    "data-testid=\"architect-process-context-panel\"",
    "data-testid=\"architect-map-human-actions\"",
    "data-testid=\"architect-reserved-silo-heads\"",
    "<SubjectFilterPanel",
    "data-testid=\"architect-anchored-subjects\"",
    "data-testid=\"architect-ungrouped-keywords\"",
    "data-testid=\"architect-formation-objective\"",
    "data-testid=\"architect-cross-silo-proposals\"",
    "data-testid=\"architect-serp-subject-advanced\"",
    "data-testid=\"architect-differentiation-advanced\"",
    "data-testid=\"architect-formation-deferred-list\"",
    "Candidatas provisórias a Silo",
    "<ArchitectArchitectureMap",
  ]) assert.ok(grade.includes(marca), `${marca} continua em Detalhes técnicos`);
  assert.equal(grade.includes("<ArticleImprovementPanel"), false);
  assert.equal(grade.includes("<LeftoverOpportunitiesPanel"), false);
  assert.equal(fonte.split("<ArticleImprovementPanel").length - 1, 1);
  assert.equal(fonte.split("<LeftoverOpportunitiesPanel").length - 1, 1);
});

test("Processar e Concluir formação ficam à mão, com os mesmos handlers e as mesmas travas", () => {
  const barra = tela.slice(tela.indexOf("data-testid=\"architect-articles-formation-actions\""), tela.indexOf("data-architect-table=\"articles\""));
  assert.match(barra, /onClick=\{\(\) => \{ void processArticleFormation\(\); \}\}\s*disabled=\{formationBusy \|\| Boolean\(formationSelectionScope\.reason\)\}/);
  assert.match(barra, /onClick=\{\(\) => \{ void confirmArticleFormation\(\); \}\}\s*disabled=\{formationBusy \|\| !articleFormationMarker \|\| Boolean\(formationSelectionScope\.reason\)\}/);
  assert.match(barra, /Concluir formação/);
});

test("validação em andamento: o cartão diz que está validando, com o andamento, e não 'parou no meio' com o botão desabilitado", async () => {
  const { resolveImprovementNextStep } = await import("../lib/arquiteto/article-improvement-next-step.ts");
  const base = { hasRun: true, state: "collecting", leaseActive: false, accepted: false, paidQueries: 144, costMaxUsd: 0.5, selectedCount: 0 };
  const trabalhando = resolveImprovementNextStep({ ...base, busy: true, collectProgress: { done: 7, total: 36 } });
  assert.equal(trabalhando.kind, "working");
  assert.match(trabalhando.sentence, /7 de 36 grupos validados/);
  const parado = resolveImprovementNextStep({ ...base, busy: false });
  assert.equal(parado.kind, "resume_collect");
  assert.equal(parado.button, "Continuar");
});

test("gravação em andamento: o cartão diz que está gravando, com X de Y, e não 'parou no meio'", async () => {
  const { resolveImprovementNextStep } = await import("../lib/arquiteto/article-improvement-next-step.ts");
  const base = { hasRun: true, state: "applying", leaseActive: false, accepted: true, paidQueries: 0, costMaxUsd: 0, selectedCount: 10 };
  const gravando = resolveImprovementNextStep({ ...base, busy: true, applyProgress: { done: 2, total: 10 } });
  assert.equal(gravando.kind, "working");
  assert.match(gravando.sentence, /2 de 10 artigos gravados/);
  assert.equal(resolveImprovementNextStep({ ...base, busy: false }).kind, "resume_apply");
});
