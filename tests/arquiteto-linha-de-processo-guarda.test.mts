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
  /*
   * 2026-10-17 (noite) · SUBSTITUÍDO "Processar = Validar SERP" (16/10): as linhas do plano marcadas seguem pelo MESMO
   * botão — Processar = a leitura com o reforço e a SERP que falta (custo antes); Concluir = gravar tudo e fechar o Silo.
   */
  assert.match(barra, /if \(doPlano\.length\) planSheet\.start\("processArticles", doPlano\);/);
  assert.match(barra, /if \(doPlano\.length\) planSheet\.start\("concludeFormation", doPlano\);/);
  assert.doesNotMatch(barra, /validateSerp/);
});

/*
 * 2026-10-17 (noite) · O DONO, literal: "3 botões já é suficiente para resolver tudo, e na mesma linha de processo sem
 * inventar outras linhas"; "tem 7 botões totalmente inúteis"; "tem que ser sequencial". Na barra, só os 3, uma vez cada,
 * em sequência (o passo atual destacado; o seguinte só habilita com o anterior feito, o porquê no `title`).
 */
test("a barra tem SÓ 3 botões, em sequência — Processar artigos → Concluir formação → Melhorar publicados… — sem 'Ações do Assunto' nem 'Fechar “Melhorar publicados”'", () => {
  assert.equal(contar(barra, "<button"), 3, "três botões e nenhum outro");
  assert.doesNotMatch(barra, /subjectActions|SubjectActionsControl|Ações do Assunto|Prender Assunto|Formar artigos automaticamente|Fechar “Melhorar publicados”/);
  assert.doesNotMatch(detalhes, /subjectActions=\{|<SubjectActionsControl/, "as ações do Assunto não moram em Detalhes técnicos");
  // A sequência: o passo atual é o destacado; Concluir espera o Processar; Melhorar espera o Concluir (publicados: sempre).
  assert.match(barra, /const passo: ArticlesFormationStep \| null = total === 0 \? \(publishedCount > 0 \? "improve" : null\) : concluiu \? "improve" : processou \? "conclude" : "process";/);
  assert.match(barra, /const motivoConcluir = ocupado \?\? semSelecao \?\? \(processou \? null : "Passo 1 primeiro: /);
  assert.match(barra, /const motivoMelhorar = improvementOpen \|\| publishedCount > 0 \|\| concluiu \? null : "Passo 2 primeiro: /);
  for (const passo of ["process", "conclude", "improve"]) assert.match(barra, new RegExp(`data-step="${passo}"`), passo);
  // O mesmo botão abre e fecha o refazedor; o rótulo não muda.
  assert.match(barra, /aria-pressed=\{improvementOpen\}/);
  assert.match(tela, /onToggleImprovement=\{\(\) => setImprovementPanel\(atual => atual === "open" \? "closed" : "open"\)\}/);
  // As ações do Assunto (Prender, Soltar, Confirmar o do Silo) moram no painel do artigo aberto, pelos MESMOS handlers, uma vez.
  assert.equal(contar(tela, "<SubjectActionsControl"), 1);
  const linhaAberta = tela.slice(tela.indexOf("data-testid=\"architect-article-subject-actions\"") - 400, tela.indexOf("data-testid=\"architect-article-subject-actions\"") + 2400);
  assert.match(linhaAberta, /\{isExpanded && subjectFilterEntries\.length > 0 && \(/);
  assert.match(linhaAberta, /<SubjectActionsControl/);
  // "Formar artigos automaticamente": duplicata de Processar + Concluir no grupo com plano — só para o Assunto sem plano.
  assert.match(linhaAberta, /onOpenSupport=\{activeSubjectFilter && !subjectStandings\.get\(activeSubjectFilter\)\?\.plan \? \(\) => setSubjectSupportOpen\(true\) : null\}/);
});

/*
 * 2026-10-17 (noite) · O DONO: "do resto dos dados inúteis ou que não aportam em nada pode apagar" (exibição, não o
 * banco). Os textos fixos sem ação saíram de "Detalhes técnicos" e do refazedor; ficam o custo antes de pagar, o que
 * falta em cada linha, os erros e o checklist da prévia. As FUNÇÕES ficam (recolhidas, com título curto).
 */
test("os textos sem ação não voltam (painel do refazedor, Detalhes técnicos e prévias), e as funções continuam", () => {
  const painelCru = ler("modules/arquiteto/article-improvement-panel.tsx");
  for (const fora of ["URL, slug e canonical nunca mudam.</p>", "Esta análise leu só o grupo", "Sem publicado marcado na planilha", "analisado(s):", "Nenhum publicado ou Assunto tem melhoria", "sem melhoria possível agora", "architect-improvement-known", "architect-improvement-next-step", "Próximo passo", "Retomar esta análise", "Buscar keywords novas no Google Ads", "Buscar keywords da cor", "Buscar de novo", "Gravar sem validar", "<ReworkNotice", "Refazer mesmo assim", "Ir para Artigos novos", "Ver Sobras"]) {
    assert.ok(!painelDeMelhoria.includes(fora), `${fora} não volta ao refazedor`);
  }
  // No refazedor, os botões são só os da prévia: Cancelar e Confirmar.
  assert.equal(contar(painelDeMelhoria, "<button"), 2, "Cancelar e Confirmar, e nenhum outro");
  assert.match(painelDeMelhoria, /\{previaAberta && run \? <div[^>]*data-testid="architect-improvement-preview"/);
  assert.match(painelCru, /discover: true/, "a busca nova no Google Ads é um passo da leitura (grátis), não um botão");
  // O "refazer com motivo" vive DENTRO da prévia (a guarda de retrabalho de sempre, `reworkOverride`).
  assert.match(painelDeMelhoria, /data-testid="architect-improvement-rework-reason"/);
  assert.match(painelDeMelhoria, /reworkOverride: \{ reason: options\.reworkReason \}/);
  // Detalhes técnicos: sem o parágrafo do "Objetivo do lote" e com os títulos curtos das funções avançadas.
  for (const fora of ["O lote tem páginas publicadas ou Assuntos declarados: as livres reforçam", "Você pediu artigos novos com as sobras: depois de reforçar", "(as com volume estão em Sobras, abaixo)", "mesmo assunto no Google, trocas e reforços um a um</summary>", "Fora de artigo por precedência, pelo objetivo do lote ou pelo teto de seis"]) assert.ok(!tela.includes(fora), `${fora} não volta`);
  assert.match(grade, />Análise por keyword \(avançado\)<\/summary>/);
  assert.match(grade, />Diferenciar publicados \(avançado\)<\/summary>/);
  // A linha do plano não se repete em "Pendências", "Keywords sem artigo" nem "Keywords não agrupadas pela formação".
  assert.match(grade, /\]\.filter\(row => groupCut\.keyword\(row\.keywordId\) && !planSheet\.rowByKeywordId\.has\(row\.keywordId\)\),/);
  assert.match(tela, /groupCut\.keyword\(String\(keyword\.id\)\) && !planSheet\.rowByKeywordId\.has\(String\(keyword\.id\)\)/);
  // As prévias das linhas do plano: o custo e o checklist ficam; o resumo não tem botão "Fechar".
  assert.doesNotMatch(linhasDoPlano, /architect-plan-sheet-summary-close/);
  assert.match(linhasDoPlano, /data-testid="architect-plan-sheet-serp-cost"/);
  assert.match(linhasDoPlano, /data-testid="architect-plan-sheet-checklist"/);
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
  // 2026-10-16 (noite) · saíram "architect-anchored-subjects" e "<SubjectFilterPanel" (pedido do dono; ver o teste "os textos que o dono mandou tirar").
  for (const marca of ["{workspaceMode === \"articles\" && pendingKeywordReview && (", "<SerpSubjectDiagnosisPanel", "<PublishedDifferentiationSection", "{FORM_NEW_FROM_LEFTOVERS_ACTION}", "Mover todas para o Silo do destino", "<ArticleFormationPanel", "data-testid=\"architect-ungrouped-keywords\"", "data-testid=\"architect-formation-deferred-list\"", "data-testid=\"architect-reserved-silo-heads\"", "Candidatas provisórias a Silo"]) {
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
  // 2026-10-16 (noite) · SUBSTITUÍDO: "Formação desatualizada", o gate SERP em frase, "Formação concluída" e "aguardando sustentação" ficavam aqui — saíram (pedido do dono, ver o teste abaixo).
  for (const fica of ["architect-cross-silo-alert", "architect-parent-binding", "architect-waiting-toggle", "architect-chart-candidate", "architect-conclusion-gates", "precisa(m) de revisão"]) {
    assert.ok(painelDeFormacao.includes(fica), `${fica} fica no painel`);
  }
  // O vínculo com o Silo só aparece no conflito de verdade (o inferido do legado é leitura interna).
  assert.match(painelDeFormacao, /\(parentBinding\.conflict > 0 \|\| parentBinding\.unresolved > 0\) &&/);
  // Os dados não foram apagados: só a exibição. A formação continua lendo as mesmas fontes (o gate SERP barra "Concluir formação" na portaria).
  assert.match(tela, /const articleSerpGateSummary = useMemo\(/);
  assert.match(tela, /conclusionGates=\{conclusionGates\}/);
});

/*
 * 2026-10-16 (noite) · PEDIDO DO DONO, literal: "quero que desapareça esse
 * monte de texto no painel que só confunde e não ajuda em nada, Assuntos · 15,
 * Assuntos como tronco · 11, e não sei o que significam todas estas mensagens:
 * Formação desatualizada…, 15 Assunto(s) aguardando sustentação, 4 de 15
 * artigo(s) foram confrontados com a SERP…, Ver 1 pendência(s), Formação
 * concluída. 11 artigo(s)…". A guarda impede que voltem — e que as FUNÇÕES
 * deles sumam: o que pedia "Reprocessar artigos" é o destaque do próprio botão;
 * as pendências, um contador no botão que as abre; as ações do Assunto
 * (Prender, Formar automaticamente, Soltar, Confirmar o do Silo), a barra.
 */
test("os textos que o dono mandou tirar não voltam, e as funções deles continuam (botão destacado, contador, ações do Assunto na barra)", () => {
  const painelCru = ler("modules/arquiteto/article-formation-panel.tsx");
  for (const fora of ["architect-formation-stale", "Formação desatualizada: o lote mudou", "subjectsAwaitingSupport", "Assunto(s) aguardando sustentação", "architect-serp-gate-alert", "foram confrontados com a SERP.{\" \"}", "architect-formation-confirmed", "artigo(s) confirmado(s)", "Ver ${waiting.rows.length} pendência(s)", "ainda não possuem Silo"]) {
    assert.ok(!painelDeFormacao.includes(fora), `${fora} não volta ao painel`);
  }
  assert.ok(!painelCru.includes("data-testid=\"architect-formation-stale\""));
  // Nenhuma das props da frase volta ao painel nem à chamada dele.
  assert.doesNotMatch(painelDeFormacao, /\bstale: boolean|\bconfirmed: \{|\bserpGate: \{/);
  const chamada = grade.slice(grade.indexOf("<ArticleFormationPanel"), grade.indexOf("onMergeCandidates=", grade.indexOf("<ArticleFormationPanel")));
  assert.doesNotMatch(chamada, /stale=\{|confirmed=\{|serpGate=\{/);
  // As fichas "Assuntos · N" e "Assuntos como tronco · N" não voltam (nem o filtro de Assunto da tabela).
  for (const fora of ["<SubjectFilterPanel", "architect-anchored-subjects", "Assuntos como tronco", "filterBySubject(", "architect-subject-filter"]) assert.ok(!tela.includes(fora), `${fora} não volta`);
  assert.doesNotMatch(semComentarios(ler("modules/arquiteto/subject-panels.tsx")), /SubjectFilterPanel|SUBJECT_FILTER_LABEL|Todos os artigos|architect-subject-filter/);
  // A função continua: "Reprocessar artigos" destacado (title curto) quando a formação de sempre está desatualizada.
  assert.match(barra, /data-stale=\{stale \? "true" : undefined\}/);
  // 2026-10-17 (noite) · o destaque é o do passo atual da sequência; a formação desatualizada também destaca o Processar.
  assert.match(barra, /className=\{destaque\("process", stale\)\}/);
  assert.match(barra, /ARTICLES_STALE_TITLE = "O lote mudou desde a última análise: reprocesse os artigos\."/);
  assert.match(tela, /stale=\{formationIsStale\}\s*attentionClassName=\{ARCHITECT_UI\.primaryButton\}/);
  // As pendências: só o contador no botão que as abre, quando há.
  assert.match(painelDeFormacao, /\{waiting\.rows\.length > 0 && \(/);
  assert.match(painelDeFormacao, /\{`Pendências \(\$\{waiting\.rows\.length\}\)`\}/);
  // As ações do Assunto: pelos MESMOS handlers, uma vez cada. 2026-10-17 (noite) · SUBSTITUÍDO "na barra": no painel do artigo aberto (o teste acima, dos 3 botões).
  assert.equal(contar(tela, "<SubjectActionsControl"), 1);
  assert.doesNotMatch(barra, /\{subjectActions\}/);
  for (const handler of ["onOpenAttach={() => setSubjectAttachOpen(true)}", "() => setSubjectSupportOpen(true)", "onDetach={anchor => { void detachSubjectAnchor(anchor); }}", "onConfirmSiloSuggestion={ref => { void confirmSiloSubjectSuggestion(ref); }}"]) assert.equal(contar(tela, handler), 1, handler);
  const acoes = semComentarios(ler("modules/arquiteto/subject-panels.tsx"));
  for (const rotulo of ["{SUBJECT_ATTACH_ACTION_LABEL}", "Formar artigos automaticamente", "{SUBJECT_DETACH_ACTION_LABEL}", "{SUBJECT_SILO_SUGGESTION_ACTION_LABEL}"]) assert.ok(acoes.includes(rotulo), `${rotulo} continua`);
  // E o "1 fica de fora: Silo do plano…" da aba Silos só acompanha o botão do lote de desfazer.
  assert.doesNotMatch(tela, /fica\$\{siloUndoPlanExcluded\.length === 1 \? "" : "m"\} de fora/);
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
  /*
   * 2026-10-17 (noite) · SUBSTITUÍDO "Concluir formação FORMA: a linha já formada fica fora" (16/10): o Processar e o
   * Concluir levam também o artigo do plano já formado (o reforço dele vira a versão seguinte, na mesma confirmação).
   * Só o que já está no Radar fica fora, com o caminho do refazedor ("Melhorar publicados…").
   */
  assert.match(dominioDoPlano, /action !== "swapPrincipal" && row\.formation\.state === "in_radar" \? planSheetInRadarRefusal\(row\.formation\.label\)/);
  assert.doesNotMatch(dominioDoPlano, /planSheetFormedRefusal|row\.formation\.state === "formed" \|\| row\.formation\.state === "in_radar"\) \? /);
  assert.match(dominioDoPlano, /use “Melhorar publicados…”/);
});

test("Concluir formação tem a MESMA porta do plano que Processar artigos (auditoria 16/10: só a divisão da seleção evitava gravar artigo do plano pelo caminho de sempre)", () => {
  const concluir = tela.slice(tela.indexOf("const confirmArticleFormation = useCallback("), tela.indexOf("const confirmArticleFormation = useCallback(") + 9000);
  assert.match(concluir, /planoPorKeywordRef\.current\.get\(id\)/);
  assert.match(concluir, /if \(doPlanoNoConcluir\.length\) \{/);
  assert.ok(concluir.indexOf("doPlanoNoConcluir") < concluir.indexOf("publishedKeywordIdSetRef"), "a porta do plano vem antes de qualquer gravação");
});
