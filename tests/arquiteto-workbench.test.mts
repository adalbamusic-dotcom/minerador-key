import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, test } from "node:test";

const workbench = readFileSync("modules/arquiteto/arquiteto-workbench.tsx", "utf8");
const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

describe("Workbench de processos do Arquiteto", () => {
  it("mantém as áreas como tabs na GlobalTopbar e dá a cada fase o seu painel", () => {
    assert.match(workspace, /tabs:\s*<nav[^>]+data-arquiteto-topbar-tabs/);
    assert.match(workspace, /role="tablist"[^>]+data-arquiteto-topbar-tabs/);
    assert.doesNotMatch(workbench, /<nav[^>]+data-arquiteto-topbar-tabs/);
    // As TRÊS fases operam por painel de fase. Links era a última que ainda
    // pedia motor por motor; nenhuma aba renderiza botão de processo agora.
    assert.match(workbench, /\{mode === "silos" && architecture\?\.panel\}/);
    assert.match(workbench, /\{mode === "articles" && formation\?\.panel\}/);
    assert.match(workbench, /\{mode === "links" && links\?\.panel\}/);
    assert.doesNotMatch(workbench, /data-testid=\{`architect-process-\$\{process\}`\}/);
  });

  it("mantém os motores como domínio sem devolvê-los à tela", () => {
    // Lógica, SERP, IA e Revisão continuam existindo como vocabulário do
    // domínio e como contrato de props. O que saiu da tela foi a obrigação de
    // apertar um por um — inclusive em Links, onde "IA · Bloqueado" descrevia
    // o estado do motor no lugar do ato que faltava.
    assert.match(workbench, /export type ArchitectProcess = "logic" \| "serp" \| "ai" \| "review"/);
    assert.match(workbench, /processes: Record<ArchitectProcess, \{ state: ArchitectProcessState/);
    assert.doesNotMatch(workbench, /processLabel|processNames|processTone|processIcon/);
    assert.doesNotMatch(workspace, /contextExpanded|architect-context-toggle|Mostrar contexto|Ocultar contexto/);
    assert.match(workspace, /data-testid="architect-workbench-layout"/);
    assert.match(workspace, /data-testid="architect-workbench-left"/);
    assert.match(workspace, /data-testid="architect-process-context-panel"/);
  });

  it("retira as ações de processo do rodapé e preserva somente seleção/handoff final", () => {
    const footerStart = workspace.indexOf("Ações que dependem da seleção");
    const footer = workspace.slice(footerStart);
    assert.doesNotMatch(footer, /Validar SERP|Revisar com IA|Confirmar arquitetura/);
    assert.match(footer, /Enviar ao Radar/);
    assert.match(footer, /Limpar seleção/);
  });

  it("representa keywords dentro de grupos independentes no mapa de Artigos", () => {
    assert.match(workbench, /export function ArchitectArchitectureMap/);
    assert.match(workbench, /current: "Atual", logic: "Lógica", serp: "SERP", ai: "IA"/);
    assert.match(workbench, /from "@xyflow\/react"/);
    assert.match(workbench, /<ReactFlow/);
    assert.match(workbench, /buildArchitectFlowProjection/);
    assert.match(workbench, /keywordFlowId/);
    assert.match(workbench, /kind: "keyword"/);
    assert.match(workbench, /keyword-edge:/);
    assert.match(workbench, /flowGroupNode/);
    assert.doesNotMatch(workbench, /kind: "article"/);
    assert.doesNotMatch(workbench, /articleFlowId\(article\.id\)/);
    assert.match(workbench, /const principal = article\.keywords\.find\(keyword => keyword\.role === "principal"\) \|\| article\.keywords\[0\]/);
    assert.match(workbench, /const related = article\.keywords\.filter\(keyword => keyword\.id !== principal\?\.id\)/);
    assert.match(workbench, /keywordFlowId\(article\.id, principal\.id\),[\s\S]*?keywordFlowId\(article\.id, keyword\.id\)/);
    // Arvore de um nivel: principal em cima, secundarias em linha embaixo; grupos empilhados.
    assert.match(workbench, /const groupPadX = 16/);
    assert.ok(workbench.includes("const groupWidth = groupPadX * 2 + contentWidth"));
    assert.ok(workbench.includes("const contentWidth = Math.max(principalWidth, relatedRowWidth)"));
    // Principal e linha de secundarias centralizadas no mesmo eixo.
    assert.ok(workbench.includes("contentX + (contentWidth - principalWidth) / 2"));
    assert.ok(workbench.includes("contentX + (contentWidth - relatedRowWidth) / 2"));
    // Aresta desce da base da principal ao topo da secundaria.
    assert.ok(workbench.includes("sourcePosition: Position.Bottom, targetPosition: Position.Top"));
    assert.ok(workbench.includes("export function keywordNodeWidth"));
    assert.ok(workbench.includes("relatedX += keywordWidth + keywordGapX"));
    // O empilhamento vertical das secundárias saiu: elas agora formam uma linha.
    assert.ok(!workbench.includes("keywordStartY + relatedIndex * keywordRowGap"));
    assert.doesNotMatch(workbench, /relatedIndex - 1/);
    assert.doesNotMatch(workbench, /truncate|line-clamp/);
    assert.ok(workbench.includes("let groupY = 8"));
    assert.ok(workbench.includes("groupY += groupHeight + groupGap"));
    assert.ok(!workbench.includes("groupX += groupWidth + groupGap"), "os grupos voltam a empilhar; o avanço horizontal saiu");
    // O canvas é o viewport: a navegação é pan/zoom do React Flow, não rolagem.
    // Por isso não há mais altura de conteúdo calculada nem overflow rolável aqui.
    assert.doesNotMatch(workbench, /projectionContentHeight/);
    assert.doesNotMatch(workbench, /overflow-y-auto/);
    assert.doesNotMatch(workbench, /const columns =|columnGap/);
    assert.match(workbench, /buildInternalLinkGraphProjection/);
    assert.match(workbench, /nodeType === "SILO_PAGE"/);
    assert.match(workbench, /nodeType === "ARTICLE_DNA"/);
  });

  it("aplica visibilidade e ghosting sem alterar o domínio", () => {
    assert.match(workbench, /selectedArticleIds: ReadonlySet<string>/);
    assert.match(workbench, /visibleArticleIds: ReadonlySet<string>/);
    assert.match(workbench, /articlesInFlowScope/);
    assert.match(workbench, /selectedArticleIds\?: ReadonlySet<string>/);
    assert.match(workbench, /visibleArticleIds\?: ReadonlySet<string>/);
    assert.match(workbench, /if \(visibleArticleIds\) \{[\s\S]*?visibleArticleIds\.has\(article\.selectionId\)/);
    assert.match(workbench, /const ghosted = Boolean\(selected &&/);
    assert.match(workbench, /ghosted,/);
    assert.match(workbench, /opacity-40/);
    // A aresta é estrutura visível do agrupamento: module-accent, não o divisor.
    assert.ok(workbench.includes('stroke: "var(--module-accent)"'));
    assert.ok(!workbench.includes('stroke: scenario === "serp" ? "var(--context-accent)" : "var(--divider)"'));
    assert.match(workbench, /opacity: ghosted \? 0\.3 : 0\.9/);
    assert.match(workspace, /selectedArticleIds=\{selectedArticleIds\}/);
    assert.match(workspace, /visibleArticleIds=\{mapVisibleArticleIds\}/);
    assert.match(workspace, /mapVisibleArticleIds = useMemo/);
    assert.match(workbench, /const linksEditable = mode === "links" && links\?\.scenario === "working"/);
    assert.match(workbench, /nodesDraggable=\{Boolean\(linksEditable\)\}/);
    assert.match(workbench, /nodesConnectable=\{Boolean\(linksEditable\)\}/);
    assert.match(workbench, /onNodeClick=/);
    assert.match(workbench, /onNodesChange=\{linksEditable \? handleNodesChange : undefined\}/);
    assert.match(workbench, /onConnect=\{linksEditable \? handleConnect : undefined\}/);
    assert.doesNotMatch(workbench, /localStorage\.(setItem|getItem)|\baddEdge\(/);
    assert.match(workbench, /const related = article\.keywords\.filter\(keyword => keyword\.id !== principal\?\.id\)/);
    assert.match(workbench, /edges\.push\(flowEdge\([\s\S]*?keywordFlowId\(article\.id, principal\.id\),[\s\S]*?keywordFlowId\(article\.id, keyword\.id\)/);
    const mapOnly = workbench.slice(workbench.indexOf("export function ArchitectArchitectureMap"), workbench.indexOf("\/\* A planilha canônica"));
    assert.doesNotMatch(mapOnly, /setMasterList|persistWorkingCopyAssignments|setProvisionalGroups/);
    assert.match(workbench, /data-testid="architect-map-toggle"/);
    assert.match(workbench, /onClick=\{\(\) => onExpandedChange\(!expanded\)\}/);
    const focusStart = workspace.indexOf("const handleMapFocusArticle");
    const focusHandler = workspace.slice(focusStart, workspace.indexOf("const syncArticleInSiloWorkingCopies", focusStart));
    assert.doesNotMatch(focusHandler, /setExpandedIds/);
  });

  it("mantém cenários históricos, comparativo à esquerda e exploração visual controlada", () => {
    assert.match(workspace, /mapLogicGroupsSnapshot \|\| provisionalGroups/);
    assert.match(workspace, /mapSerpArticlesSnapshot \|\| currentArticles/);
    assert.match(workspace, /mapAiArticlesSnapshot \? sortMapArticles\(mapAiArticlesSnapshot\) : currentArticles/);
    assert.match(workspace, /setMapAiArticlesSnapshot/);
    assert.match(workspace, /setMapState\(previous => \(\{[\s\S]*?scenario,[\s\S]*?selectedNodeId: null/);
    assert.match(workspace, /data-testid="architect-map-comparison"/);
    assert.match(workspace, /Comparar com Atual/);
    assert.match(workspace, /expanded=\{mapExpanded\}/);
    assert.match(workspace, /onExpandedChange=\{setMapExpanded\}/);
    assert.match(workspace, /overflow-hidden p-0/);
    // Recolhido ocupa um terço do topo (a planilha é a prioridade); a seta abre para 72vh.
    assert.match(workspace, /mapExpanded \? "lg:max-h-\[72vh\]" : "lg:max-h-\[33vh\]"/);
    assert.match(workbench, /expanded \? "h-\[clamp\(24rem,72vh,56rem\)\]" : "h-\[clamp\(12rem,33vh,24rem\)\]"/);
    assert.doesNotMatch(workbench, /h-\[clamp\(11rem,18vh,15rem\)\]/);
    // O mapa começa recolhido e só a seta abre: trocar de processo não expande.
    assert.match(workspace, /const \[mapExpanded, setMapExpanded\] = useState\(false\)/);
    assert.doesNotMatch(workspace, /onProcessChange=\{\(process\) => \{ setActiveProcess\(process\); setMapExpanded\(true\); \}\}/);
    // React Flow faz pan e zoom próprios: nada de rolagem concorrente no canvas.
    assert.match(workbench, /relative min-w-0 overflow-hidden rounded-lg border border-divider bg-background/);
    assert.match(workbench, /expanded && <Controls/);
    assert.match(workbench, /expanded && <MiniMap/);
    // Sem rolagem no canvas, todo modo precisa enquadrar o grafo na área visível.
    assert.match(workbench, /^\s*fitView$/m);
    assert.doesNotMatch(workbench, /fitView=\{mode !== "articles"\}/);
    assert.match(workbench, /fitViewOptions=\{\{ padding: 0\.06/);
    assert.doesNotMatch(workbench, /<p[^>]*>Mapa de arquitetura<\/p>/);
    assert.doesNotMatch(workbench, /Projeção da working copy; não é fonte de verdade/);
  });

  it("separa tecnicamente o builder de Silos do mapa de Artigos", () => {
    const siloProjection = workbench.slice(workbench.indexOf("const articleById"), workbench.indexOf("function ArchitectFlowGroupView"));
    assert.match(siloProjection, /articleById/);
    assert.match(siloProjection, /kind: "pillar"/);
    assert.match(siloProjection, /summary\(articleId, "support"\)/);
    assert.match(siloProjection, /silo-pillar:/);
    assert.match(siloProjection, /silo-support:/);
    assert.match(siloProjection, /const siloPageColumnX = 8/);
    assert.match(siloProjection, /const pillarColumnX = 280/);
    assert.match(siloProjection, /const supportColumnX = 552/);
    assert.match(siloProjection, /const supportArticleIds = silo\.supportArticleIds\.slice\(0, 6\)/);
    assert.match(siloProjection, /const supportStep = 148/);
    assert.match(siloProjection, /let siloY = 18/);
    assert.match(siloProjection, /siloY \+= siloHeight \+ siloGap/);
    assert.match(siloProjection, /x: siloPageColumnX, y: centeredNodeY/);
    assert.match(siloProjection, /x: pillarColumnX, y: centeredNodeY/);
    assert.match(siloProjection, /x: supportColumnX, y: supportStartY \+ supportIndex \* supportStep/);
    assert.match(siloProjection, /sourcePosition: Position\.Right, targetPosition: Position\.Left/);
    assert.doesNotMatch(siloProjection, /Position\.Bottom|Position\.Top/);
    assert.doesNotMatch(siloProjection, /keyword-edge:|keywordFlowId/);
  });

  it("mantém uma única mesa operacional, com projeção de linha por modo", () => {
    const spreadsheetStart = workspace.indexOf("        {canonicalBootstrapError ?");
    const spreadsheet = workspace.slice(spreadsheetStart, workspace.indexOf("</main>", spreadsheetStart));

    // Uma planilha só: um `<table>`, nenhum patrimônio paralelo por aba.
    // Ancorado no marcador da planilha, não em classe de layout: a largura das
    // colunas passou a ser responsiva/redimensionável e não pode travar o teste.
    assert.equal((workspace.match(/data-architect-table="articles"/g) || []).length, 1);
    assert.doesNotMatch(workspace, /min-w-\[110rem\]/);
    assert.doesNotMatch(workspace, /ArchitectInternalLinksPlaceholder|ArchitectSiloModeTable|SilosTable|LinksTable/);
    // Shell compartilhado; o que muda por modo é a projeção de linha, não a mesa.
    assert.match(spreadsheet, /<TerritorialWorkspaceRows/);
    // Artigos passou a ser hierarquia por SiloPage; a lista plana continua
    // servindo às demais áreas, na MESMA mesa.
    // Artigos agrupa por SiloPage dentro da MESMA mesa; a linha de Article
    // continua sendo a memoizada de sempre, com o detalhe completo.
    assert.match(spreadsheet, /<ArticleSiloPageRow/);
    assert.match(spreadsheet, /workspaceMode === "silos" \? \[\] : groupedArticles/);
    assert.match(spreadsheet, /filteredArticles\.length === 0/);
    assert.match(spreadsheet, /groupedArticles\.map/);
    // "ARTIGOS SEM SILO" continua existindo, mas como decisão do AGRUPAMENTO —
    // nunca redecidida na hora de desenhar o cabeçalho, que só mostra o nome já
    // resolvido. Redecidir ali punha três Silos confirmados sob esse rótulo.
    assert.match(workspace, /const siloName = pai\.hasParent \? articleParentLabel\(pai\) : "ARTIGOS SEM SILO";/);
    assert.match(spreadsheet, /\{group\.siloName\}/);
    // A aba Links tem lugar próprio no workbench, como Silos e Artigos: o que
    // ali se lê é a fase, não o estado dos motores.
    assert.match(workbench, /\{mode === "links" && links\?\.panel\}/);
    assert.match(workspace, /Links internos · fase final da passada/);
  });

  it("projeta Links somente com SiloPage/ArticleDNA e mantém a edição canônica fora do canvas", () => {
    assert.match(workbench, /export function buildInternalLinkGraphProjection/);
    assert.match(workbench, /edges: graph\.edges\.map\(edge => linkFlowEdge/);
    assert.match(workbench, /markerEnd: \{ type: MarkerType\.ArrowClosed/);
    assert.match(workbench, /onCreateEdge\?\.\(connection\.source, connection\.target\)/);
    assert.match(workspace, /persistInternalLinkGraphWorkingCopy/);
    assert.match(workspace, /updateInternalLinkGraphWorkingCopy/);
    assert.match(workspace, /persistInternalLinkGraph\(/);
    assert.match(workspace, /lockVersion: linksPersistedLockVersion/);
    assert.match(workspace, /setLinksSaveState\("idle"\);[\s\S]*?updateInternalLinkGraphWorkingCopy/);
    assert.match(workspace, /Nenhuma mudança estrutural foi feita; uma versão equivalente não será criada/);
    assert.match(workspace, /linksAuthenticatedActor/);
    assert.match(workspace, /Conflito de versão/);
    assert.match(workspace, /Erro de persistência/);
    assert.match(workspace, /Baseline aprovado: v/);
    assert.match(workspace, /Um conceito semântico por linha/);
    assert.match(workspace, /suggestedAnchorConceptsForTarget/);
    assert.match(workspace, /suggestInternalLinkAnchorConcepts/);
    assert.doesNotMatch(workspace, /anchorConcepts: \[targetLabel\]/);
    assert.match(workspace, /A seleção só altera o contexto visual; nenhum DNA é expandido/);
    assert.match(workspace, /Ver arquitetura/);
    assert.match(workbench, /nodeDisplay/);
  });

  it("mantém o ref aprovado disponível para consumidores downstream sem criar bypass", () => {
    const persistence = readFileSync("lib/arquiteto/internal-link-graph-persistence.ts", "utf8");
    const route = readFileSync("app/api/arquiteto/internal-link-graph/route.ts", "utf8");
    assert.match(persistence, /InternalLinkGraphRefSchema/);
    assert.match(persistence, /ref: body\.data\.ref \? InternalLinkGraphRefSchema\.parse/);
    assert.match(route, /internalLinkGraphRefForDownstream/);
    assert.match(route, /data: \{ source: "CANONICAL_REMOTE", graph, ref:/);
    assert.doesNotMatch(workspace, /RadarPlannerHandoff/);
  });

  it("mantém Links sem Lógica/SERP e sem IA aplicada automaticamente", () => {
    // Links internos opera por FASE, não por motor: processar propõe,
    // confirmar encerra. "IA · Bloqueado" descrevia o estado do motor no
    // lugar do ato que faltava.
    assert.match(workbench, /\{mode === "links" && links\?\.panel\}/);
    assert.match(workspace, /data-testid="architect-links-process"/);
    assert.match(workspace, /data-testid="architect-links-confirm"/);
    assert.match(workspace, /Confirmar links internos/);
    // Uma leitura para os dois botões: cada um calculando o próprio bloqueio
    // é como a mesa passou a mostrar respostas diferentes para a mesma
    // pergunta.
    assert.match(workspace, /const linksPhaseReading = useMemo/);
    assert.match(workspace, /workspaceMode === "links"[\s\S]*?linksLoading/);
    assert.match(workspace, /Nenhuma versão do grafo carregada/);
    // A IA de Links existe e é a das ÂNCORAS — disparada por um humano no
    // botão, nunca aplicada sozinha, e sem SERP nenhuma: quantas vezes e em
    // que parágrafo é pergunta do Radar.
    assert.match(workspace, /data-testid="architect-generate-link-anchors"/);
    // A base explícita existe para o encadeamento de "Processar links": ler o
    // estado na segunda etapa pegaria a cópia anterior à primeira.
    assert.match(workspace, /const generateLinkAnchors = async \(base\?: InternalLinkGraphWorkingCopy\)/);
    assert.doesNotMatch(workspace, /useEffect\([^)]*generateLinkAnchors/);
    const anchorsRoute = readFileSync("app/api/arquiteto/internal-link-graph/anchors/route.ts", "utf8");
    // Nada de SERP no caminho: a promessa está no comentário, e a prova é não
    // haver import nem chamada de provider de busca.
    assert.doesNotMatch(anchorsRoute, /^import .*serp/im);
    assert.doesNotMatch(anchorsRoute, /serpProvider|runSerp|fetchSerp/i);
    assert.match(anchorsRoute, /persistence: "PROPOSAL_ONLY"/);
  });

  it("preserva seleção e expansão da mesma working copy ao trocar o modo", () => {
    assert.equal((workspace.match(/const \[selectedArticleIds,\s*setSelectedArticleIds\]/g) || []).length, 1);
    assert.equal((workspace.match(/const \[expandedIds, setExpandedIds\]/g) || []).length, 1);
    assert.match(workspace, /selectedCount=\{selectedArticleIds\.size \+ selectedSiloPageIds\.size\}/);
    assert.match(workspace, /selected=\{selectedArticleIds\.has\(art\.id\)\}/);
    assert.match(workspace, /const isExpanded = expandedIds\.has\(art\.id\)/);
    assert.doesNotMatch(workspace, /selectedArticleIdsByMode|expandedIdsByMode|workingCopyByMode/);
    assert.match(workspace, /setMapExpanded\(true\)/);
  });
});

test("as listas do painel do mapa não repetem item nem versão superada da SERP", () => {
  const bloco = workspace.slice(workspace.indexOf("const serpAssessmentsForMap"), workspace.indexOf("const current: ArchitectMapSnapshot"));

  // Uma avaliação vigente por Article alimenta mudanças, ganhos e perdas.
  assert.match(bloco, /const latestSerpForMap = unique\(serpArticleBase\.map\(article => article\.id\)\)/);
  assert.match(bloco, /latestActiveSerpFormationAssessment\(serpAssessmentsForMap/);
  for (const lista of ["serpChanges", "serpGains", "serpLosses"]) {
    assert.ok(bloco.includes(`const ${lista} = unique(`), `${lista} precisa ser deduplicada`);
    assert.doesNotMatch(
      bloco.slice(bloco.indexOf(`const ${lista} =`), bloco.indexOf(";", bloco.indexOf(`const ${lista} =`))),
      /serpAssessments\.(filter|flatMap)/,
      `${lista} não pode varrer todas as versões do assessment`,
    );
  }
  for (const lista of ["logicChanges", "aiChanges", "aiLosses"]) {
    assert.ok(bloco.includes(`const ${lista} = unique(`), `${lista} precisa ser deduplicada`);
  }
});

test("a deduplicação torna a chave do React única por lista", () => {
  // Réplica do helper local do workspace.
  const unique = (items: string[]) => [...new Set(items.filter(item => item.trim().length > 0))];
  const conflito = "group-ogg12k: A intenção esperada (unknown) não coincide claramente com a intenção aparente (investigacao_comercial).";
  // Caso real: o mesmo conflito vindo de duas versões do assessment do artigo.
  const cru = [conflito, conflito, "outro conflito"];

  const deduplicado = unique(cru);

  assert.equal(deduplicado.length, 2);
  assert.equal(new Set(deduplicado).size, deduplicado.length, "cada item vira uma chave única");
  assert.equal(unique([]).length, 0);
  assert.deepEqual(unique(["  ", "a"]), ["a"], "item vazio não vira chave vazia");
});
