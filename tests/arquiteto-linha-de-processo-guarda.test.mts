import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";

/*
 * 2026-10-16 · GUARDA DA RESTAURAÇÃO DO FLUXO DE SEMPRE. Ordem do dono (15/10,
 * noite, literal): "vocês não podem ficar mudando as funcionalidades"; "só
 * tinham que arrumar esses erros e esse monte de botões e duplas listas, mas
 * acabaram de mudar tudo"; "tem que voltar tudo, mas sem os erros, nem esse
 * monte de botões, nem processo em paralelo".
 *
 * É a primeira peça da guarda da FORMA DA LINHA (AGENTS.md §0.3): os botões
 * do contrato existem uma vez cada e não existe porta paralela.
 *
 * Estrutural: lê o código SEM comentários (um comentário não pode passar nem
 * reprovar um teste). Nenhuma rede, nenhum banco, nenhum custo.
 */

const raiz = new URL("../", import.meta.url);
const ler = (caminho: string) => readFileSync(new URL(caminho, raiz), "utf8");
const semComentarios = (codigo: string) => codigo.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1").replace(/\{\s*\}/g, "{}");
const contar = (texto: string, trecho: string) => texto.split(trecho).length - 1;

const tela = semComentarios(ler("modules/arquiteto/arquiteto-workspace.tsx"));
const barra = semComentarios(ler("modules/arquiteto/articles-formation-bar.tsx"));
const linhasDoPlano = semComentarios(ler("modules/arquiteto/plan-article-sheet.tsx"));
const dominioDoPlano = semComentarios(ler("lib/arquiteto/plan-article-sheet.ts"));
const painelDeFormacao = semComentarios(ler("modules/arquiteto/article-formation-panel.tsx"));
const painelDeMelhoria = semComentarios(ler("modules/arquiteto/article-improvement-panel.tsx"));
const inicioGrade = tela.indexOf("const workbenchGrid = (");
const grade = tela.slice(inicioGrade, tela.indexOf("\n  );\n", inicioGrade));
const main = tela.slice(tela.indexOf("<main className=\"min-w-0 flex-1 overflow-y-auto bg-background\">"), tela.indexOf("</main>"));

/** Todo arquivo de código de app/, lib/ e modules/ (sem comentários). */
function codigoDaPlataforma(): Array<{ caminho: string; codigo: string }> {
  const saida: Array<{ caminho: string; codigo: string }> = [];
  const andar = (pasta: string) => {
    for (const nome of readdirSync(new URL(pasta, raiz))) {
      const caminho = `${pasta}/${nome}`;
      if (statSync(new URL(caminho, raiz)).isDirectory()) andar(caminho);
      else if (/\.(ts|tsx|mts)$/.test(nome)) saida.push({ caminho, codigo: semComentarios(ler(caminho)) });
    }
  };
  for (const pasta of ["app", "lib", "modules", "components"]) andar(pasta);
  return saida;
}

test("a aba Artigos tem a barra de sempre — Processar artigos · Concluir formação · Melhorar publicados… — exatamente uma vez cada, para todo recorte", () => {
  assert.equal(contar(tela, "<ArticlesFormationBar"), 1, "uma barra só");
  assert.match(tela, /\{articleMode && <ArticlesFormationBar/);
  for (const testId of ["architect-articles-top-process", "architect-articles-top-confirm", "architect-articles-improve-published"]) {
    assert.equal(contar(barra, `data-testid="${testId}"`), 1, testId);
  }
  assert.equal(contar(barra, "\"Processar artigos\""), 1);
  assert.equal(contar(barra, "Concluir formação\n"), 1);
  assert.equal(contar(barra, "\"Melhorar publicados…\""), 1);
  // Sem ramo de "um plano no recorte": a mesma barra para grupo com plano, sem plano e "Todos".
  assert.doesNotMatch(barra, /planGroupId|runStage|architect-plan-stage|hasPublished|primaryButtonClassName|PLAN_FLOW_LABELS/);
  // As linhas do plano marcadas seguem pelo MESMO botão: Processar = Validar SERP; Concluir = formar.
  assert.match(barra, /if \(doPlano\.length\) planSheet\.start\("validateSerp", doPlano\);/);
  assert.match(barra, /if \(doPlano\.length\) planSheet\.start\("concludeFormation", doPlano\);/);
});

test("não existem as portas paralelas: etapas '1 · Formar', '2 · Reforçar', '3 · Linha editorial', '4 · Links internos', 'Consolidar o Silo do plano' nem as rotas plan-silo/consolidate|editorial-line", () => {
  for (const pasta of ["app/api/arquiteto/plan-silo/consolidate", "app/api/arquiteto/plan-silo/editorial-line"]) assert.equal(existsSync(new URL(pasta, raiz)), false, pasta);
  assert.equal(existsSync(new URL("app/api/arquiteto/plan-silo/recreate/route.ts", raiz)), true, "a rota de sempre do Silo desfeito continua");
  for (const modulo of ["lib/arquiteto/plan-consolidation.ts", "lib/arquiteto/plan-editorial-line.ts", "lib/server/arquiteto-plan-consolidation.ts", "lib/server/arquiteto-plan-editorial-line.ts", "modules/arquiteto/plan-silo-bar.tsx"]) {
    assert.equal(existsSync(new URL(modulo, raiz)), false, modulo);
  }
  const proibidos = [/1 · Formar/, /2 · Reforçar/, /3 · Linha editorial/, /4 · Links internos/, /Consolidar o Silo do plano/, /Completar sustentações e SERP/, /plan-silo\/consolidate/, /plan-silo\/editorial-line/, /writePlanArticleFromPlan/, /declaredPlanConsolidation:/];
  // O catálogo do MCP é a exceção: a nota datada da restauração diz o que saiu (texto, não porta).
  for (const { caminho, codigo } of codigoDaPlataforma().filter(item => item.caminho !== "lib/agent/platform-catalog.ts")) {
    for (const padrao of proibidos) assert.doesNotMatch(codigo, padrao, `${caminho}: ${padrao}`);
  }
  const catalogo = ler("lib/agent/platform-catalog.ts");
  assert.doesNotMatch(catalogo, /id: "arquiteto\.plan_silo"/);
  for (const rotas of catalogo.match(/routes: \[[^\]]*\]/g) ?? []) assert.doesNotMatch(rotas, /plan-silo\/consolidate|plan-silo\/editorial-line/, rotas);
  assert.doesNotMatch(dominioDoPlano, /planArticleFlowSteps|planFlowSteps|planStepTwoAction|planArticleVisibleSteps|PLAN_ARTICLE_FLOW_LABELS/);
  assert.doesNotMatch(linhasDoPlano, /runStage|consolidateSilo|editorialLine|formArticles/);
});

test("'Detalhes técnicos' existe (fechado, no fim da aba Artigos) com as funções de sempre — e sem Processar/Concluir dentro dele", () => {
  assert.match(main, /\{articleMode && \(\s*<details className="[^"]*" data-testid="architect-articles-technical">\s*<summary[^>]*>Detalhes técnicos<\/summary>\s*\{workbenchGrid\}\s*<\/details>\s*\)\}/);
  assert.ok(main.indexOf("data-testid=\"architect-articles-technical\"") > main.indexOf("data-architect-table=\"articles\""), "no fim, depois da tabela");
  // A causa do "nada é desenhado": a grade só fora da aba Artigos × as seções só na aba Artigos. Agora a grade também está em Detalhes técnicos.
  assert.match(main, /\{!articleMode && workbenchGrid\}/);
  for (const marca of ["{workspaceMode === \"articles\" && pendingKeywordReview && (", "<SerpSubjectDiagnosisPanel", "<PublishedDifferentiationSection", "{FORM_NEW_FROM_LEFTOVERS_ACTION}", "Mover todas para o Silo do destino", "<ArticleFormationPanel", "data-testid=\"architect-ungrouped-keywords\"", "data-testid=\"architect-anchored-subjects\"", "data-testid=\"architect-formation-deferred-list\"", "data-testid=\"architect-reserved-silo-heads\"", "Candidatas provisórias a Silo", "<SubjectFilterPanel"]) {
    assert.ok(grade.includes(marca), `${marca} em Detalhes técnicos`);
  }
  // Os rótulos das funções, nas peças que a grade desenha.
  const serp = ler("modules/arquiteto/serp-subject-panels.tsx");
  assert.match(serp, /Mesmo assunto no Google/);
  assert.match(serp, /Reforçar publicados/);
  assert.match(ler("lib/arquiteto/published-reinforcement-search.ts"), /REINFORCEMENT_SEARCH_ACTION_LABEL = "Buscar keywords para os publicados sem par"/);
  assert.match(tela, /Diferenciar publicados que disputam o mesmo assunto/);
  assert.match(ler("lib/arquiteto/article-formation-priority.ts"), /FORM_NEW_FROM_LEFTOVERS_ACTION = "Formar artigos novos com as sobras"/);
  // Nada em dobro: o painel de formação dentro da grade não recebe Processar/Concluir…
  const formacao = grade.slice(grade.indexOf("<ArticleFormationPanel"), grade.indexOf("/>", grade.indexOf("onMergeCandidates=")));
  assert.doesNotMatch(formacao, /onProcess=|onConfirm=/);
  assert.match(painelDeFormacao, /\{onProcess && <button/);
  assert.match(painelDeFormacao, /\{onConfirm && <button/);
  // …e o atalho "Revisão" dos processos não conclui formação na aba Artigos.
  assert.doesNotMatch(tela, /workspaceMode === "articles" \? \(\) => void confirmArticleFormation\(\)/);
  assert.equal(contar(grade, "confirmArticleFormation"), 0, "Concluir formação não mora em Detalhes técnicos");
  assert.equal(contar(grade, "processArticleFormation"), 0, "Processar artigos não mora em Detalhes técnicos");
});

test("aba Silos: o aviso 'Recriar o Silo do plano' de sempre existe; sem a linha 'Consolidar o Silo do plano'", () => {
  assert.match(tela, /\{rejectedPlanSilos\.map\(item => \(/);
  assert.match(tela, /data-testid="architect-plan-silo-recreate"/);
  assert.match(tela, /`Recriar o Silo do plano · \$\{/);
  assert.match(tela, /fetch\("\/api\/arquiteto\/plan-silo\/recreate"/);
  assert.doesNotMatch(tela, /<PlanSiloBar|planSiloStatuses|siloGateOf|consolidateSiloPair|onGoToSilos/);
});

test("o painel 'Melhorar publicados…' não exclui os artigos do plano (como em 4d546ce): é por ele que o artigo formado é reforçado", () => {
  assert.doesNotMatch(painelDeMelhoria, /excludePlanArticles/);
  assert.doesNotMatch(painelDeMelhoria, /architect-improvement-plan-elsewhere/);
  assert.equal(contar(tela, "<ArticleImprovementPanel"), 1, "uma cópia só");
  // "Concluir formação" FORMA: a linha já formada fica fora, com o caminho do reforço.
  assert.match(dominioDoPlano, /action === "concludeFormation" && \(row\.formation\.state === "formed" \|\| row\.formation\.state === "in_radar"\) \? planSheetFormedRefusal\(row\.formation\.label\)/);
  assert.match(dominioDoPlano, /use “Melhorar publicados…”/);
});
