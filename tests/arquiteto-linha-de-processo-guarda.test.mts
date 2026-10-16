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
 * 2026-10-16 (tarde) · pedido do dono: "retirar o react-flow do Silo e da aba
 * dos Artigos, deixar ele só nos Links internos. Colocar em cima de volta o
 * painel do [Detalhes técnicos] na aba dos Artigos… coloca dentro dele, no
 * topo, todos os botões dos processos e funções, até a barra de progressão…
 * pode reduzir os dados do banco de dados, mostra só o que é útil para o user,
 * centraliza tudo nele". A guarda passou a exigir essa forma: "Detalhes
 * técnicos" é o primeiro bloco da aba Artigos e tem, uma vez cada, a barra de
 * sempre, o processo em andamento, a prévia das linhas do plano, o painel de
 * melhoria e as funções; fora dele, só a tabela e as Sobras; o mapa só em
 * Links internos; sem "Workbench do Arquiteto" nem "Leitura do lote".
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
const inicioDetalhes = main.indexOf("{articleMode && (\n          <details");
const detalhes = main.slice(inicioDetalhes, main.indexOf("</details>", inicioDetalhes));
const workbench = semComentarios(ler("modules/arquiteto/arquiteto-workbench.tsx"));

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
  assert.ok(detalhes.includes("<ArticlesFormationBar"), "a barra mora em Detalhes técnicos");
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

test("'Detalhes técnicos' é o PRIMEIRO bloco da aba Artigos e tem, no topo e uma vez cada, a barra de sempre, o processo em andamento, a prévia das linhas do plano, o painel de melhoria e as funções", () => {
  assert.ok(inicioDetalhes > 0, "o bloco de Detalhes técnicos existe na aba Artigos");
  assert.match(detalhes, /<details\s+open=\{articlesTechnicalOpen \?\? articlesHavePendingAction\}/);
  assert.match(detalhes, /data-testid="architect-articles-technical"/);
  assert.match(detalhes, /<summary[^>]*>Detalhes técnicos</);
  // O primeiro bloco da aba Artigos: nada de articleMode antes dele; a tabela e as Sobras vêm depois.
  assert.equal(main.indexOf("{articleMode &&"), inicioDetalhes, "nada da aba Artigos antes de Detalhes técnicos");
  assert.ok(inicioDetalhes < main.indexOf("data-architect-table=\"articles\""), "acima da tabela");
  assert.ok(inicioDetalhes < main.indexOf("data-testid=\"architect-articles-sobras\""), "acima das Sobras");
  // No topo, nesta ordem: barra → processo em andamento → prévia/andamento do plano → melhoria → formação e funções.
  const ordem = ["<ArticlesFormationBar", "{articleProcessActivity}", "<PlanSheetOperations", "<ArticleImprovementPanel", "{workbenchGrid}"];
  let anterior = -1;
  for (const peca of ordem) {
    assert.equal(contar(detalhes, peca), 1, `${peca} uma vez em Detalhes técnicos`);
    assert.equal(contar(tela, peca), 1, `${peca} não existe fora de Detalhes técnicos`);
    const posicao = detalhes.indexOf(peca);
    assert.ok(posicao > anterior, `${peca} na ordem`);
    anterior = posicao;
  }
  // A barra de progressão dos processos: o "Processo ativo" de sempre, com a barra da plataforma, só enquanto roda.
  assert.match(tela, /const articleProcessActivity = articleMode && \(activeLogicalTask \|\| serpBusy \|\| activeKeywordReviewTask\) \?/);
  assert.match(tela, /data-testid="architect-articles-process-activity"/);
  assert.match(tela, /testId="architect-articles-process-progress"/);
  // Fora de Detalhes técnicos, na aba Artigos, só a tabela e as Sobras: nenhuma barra de processo.
  const fora = main.slice(main.indexOf("</details>", inicioDetalhes));
  assert.doesNotMatch(fora, /<ArticlesFormationBar|<PlanSheetOperations|<ArticleImprovementPanel|articleProcessActivity|architect-articles-top-process|architect-articles-top-confirm/);
  // O "Processo ativo" da área de contexto ficou só para Links internos (em Artigos ele mora em Detalhes técnicos).
  assert.match(grade, /\{workspaceMode === "links" && \(\s*<section className="rounded-lg border border-divider bg-surface-subtle p-3">\s*<p className="text-sm font-semibold text-foreground">Processo ativo/);
  // A grade: em Silos e Links abre a tela; em Artigos, dentro de Detalhes técnicos.
  assert.match(main, /\{!articleMode && workbenchGrid\}/);
  assert.equal(contar(main, "workbenchGrid}"), 2);
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
  // 2026-10-16 · e o painel nem tem mais os dois botões opcionais (código morto desde a restauração): eles são só os da barra.
  assert.doesNotMatch(painelDeFormacao, /onProcess|onConfirm|architect-process-articles|architect-confirm-formation/);
  // …e o atalho "Revisão" dos processos não conclui formação na aba Artigos.
  assert.doesNotMatch(tela, /workspaceMode === "articles" \? \(\) => void confirmArticleFormation\(\)/);
  assert.equal(contar(grade, "confirmArticleFormation"), 0, "Concluir formação não mora em Detalhes técnicos");
  assert.equal(contar(grade, "processArticleFormation"), 0, "Processar artigos não mora em Detalhes técnicos");
});

test("o mapa (React Flow) existe só em Links internos: nem na aba Silos nem na aba Artigos", () => {
  assert.equal(contar(tela, "<ArchitectArchitectureMap"), 1, "um mapa só");
  assert.match(tela, /const linksMode = workspaceMode === "links";/);
  assert.match(grade, /\{linksMode && <div className="min-h-0 min-w-0 overflow-hidden p-0">\s*<ArchitectArchitectureMap/);
  // As projeções de Silos e Artigos não chegam mais ao mapa, e a seleção pelo mapa não abre nada nessas abas.
  assert.doesNotMatch(tela, /clusterFlow=|articleFlow=|buildArticleFlowProjection|buildArchitectureFlowProjection|setPanelSiloRef|setExpandedClusterRefs/);
  // "Ações humanas" dependia do mapa: fica só em Links (mover keyword segue na linha da tabela, com a confirmação de sempre).
  assert.match(grade, /\{workspaceMode === "links" && \(\s*<section className="rounded-lg border border-divider bg-surface-subtle p-3" data-testid="architect-map-human-actions">/);
  assert.doesNotMatch(tela, /handleMapMoveKeywordToGroup|handleMapMoveArticleToSilo|Mover keyword para grupo da working copy/);
  assert.match(tela, /requestManualArchitectureAction\(\{ kind: "move", article: art, keyword: keywordItem, target \}\)/);
  // A aba Silos sem mapa: a grade não tem segunda coluna fora de Links.
  assert.match(grade, /: articleMode \? "min-w-0 bg-surface" : "grid min-h-0 shrink-0 gap-0 bg-surface lg:h-\[33vh\] lg:overflow-hidden"/);
});

test("o painel mostra só o que é útil: sem 'Workbench do Arquiteto', 'Leitura do lote', contagens internas nem ids técnicos na aba Artigos", () => {
  // O cabeçalho do Workbench (título e contagens) não aparece na aba Artigos.
  assert.match(workbench, /\{mode !== "articles" && <div className="flex flex-wrap items-center justify-between gap-3">\s*<div className="min-w-0">\s*<p[^>]*>Workbench do Arquiteto<\/p>/);
  assert.doesNotMatch(workbench, /SiloPage\(s\)|Article\(s\) formado\(s\)|articleScope|articleCount/);
  assert.doesNotMatch(tela, /articleScope=\{|articleCount=\{/);
  // O painel de formação: nada da leitura do lote nem dos gráficos de contagem.
  for (const fora of ["Leitura do lote", "architect-batch-reading", "Singletons", "Agrupamentos", "sobreposição(ões)", "Distribuição da formação", "Composição dos candidatos", "Estado da formação", "Destino das keywords", "architect-formation-state", "architect-legacy-articles", "architect-pre-serp-artifacts", "architect-fragmentation-alert", "architect-silo-panel", "architect-formation-selection-count", "keyword(s) analisada(s)"]) {
    assert.ok(!painelDeFormacao.includes(fora), `${fora} saiu do painel`);
  }
  // Fica o que leva a uma ação ou é alerta real.
  for (const fica of ["architect-formation-stale", "Reprocessar artigos", "architect-serp-gate-alert", "architect-cross-silo-alert", "architect-parent-binding", "architect-waiting-toggle", "architect-chart-candidate", "architect-conclusion-gates", "architect-formation-confirmed", "aguardando sustentação", "precisa(m) de revisão"]) {
    assert.ok(painelDeFormacao.includes(fica), `${fica} fica no painel`);
  }
  // O vínculo com o Silo só aparece no conflito de verdade (o inferido do legado é leitura interna).
  assert.match(painelDeFormacao, /\(parentBinding\.conflict > 0 \|\| parentBinding\.unresolved > 0\) &&/);
  // Os dados não foram apagados: só a exibição. A formação continua lendo as mesmas fontes.
  assert.match(tela, /serpGate=\{articleSerpGateSummary\}/);
  assert.match(tela, /conclusionGates=\{conclusionGates\}/);
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

test("Concluir formação tem a MESMA porta do plano que Processar artigos (auditoria 16/10: só a divisão da seleção evitava gravar artigo do plano pelo caminho de sempre)", () => {
  const concluir = tela.slice(tela.indexOf("const confirmArticleFormation = useCallback("), tela.indexOf("const confirmArticleFormation = useCallback(") + 9000);
  assert.match(concluir, /planoPorKeywordRef\.current\.get\(id\)/);
  assert.match(concluir, /if \(doPlanoNoConcluir\.length\) \{/);
  assert.ok(concluir.indexOf("doPlanoNoConcluir") < concluir.indexOf("publishedKeywordIdSetRef"), "a porta do plano vem antes de qualquer gravação");
});
