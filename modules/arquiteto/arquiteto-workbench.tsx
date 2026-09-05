"use client";

import React from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  MarkerType,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeChange,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ArticleFlowProjection } from "@/lib/arquiteto/article-flow";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { InternalLinkGraph, InternalLinkGraphEdge, InternalLinkGraphWorkingCopy } from "@/lib/arquiteto/contracts";
import type { ArchitectureFlowProjection } from "@/lib/arquiteto/architecture-flow";

export type ArchitectWorkspaceMode = "articles" | "silos" | "links";

export type ArchitectProcess = "logic" | "serp" | "ai" | "review";
export type ArchitectProcessState = "available" | "processing" | "completed" | "pending" | "partial" | "error" | "blocked";
export type ArchitectMapScenario = "current" | "logic" | "serp" | "ai";
export type ArchitectLinksScenario = "approved" | "working";

export type SiloScope = "all" | "site_silos" | "manual_silos" | "structures" | "unassigned";

const SILO_SCOPE_LABELS: Record<SiloScope, string> = {
  all: "Todos",
  site_silos: "Silos do site",
  manual_silos: "Silos manuais",
  structures: "Estruturas disponíveis",
  unassigned: "Sem Silo",
};

export function ArchitectWorkbench({
  mode,
  articleCount,
  articleScope = null,
  siloCount,
  selectedCount,
  // `activeProcess`, `onProcessChange` e `processes` continuam no contrato e
  // continuam sendo calculados pelo workspace: os quatro motores são domínio.
  // O que este componente não faz mais é DESENHÁ-LOS — as três fases operam
  // por painel, com duas ações nomeadas.
  siloView = "architecture",
  onSiloViewChange,
  siloScope = "all",
  onSiloScopeChange,
  architecture = null,
  formation = null,
  links = null,
}: {
  mode: ArchitectWorkspaceMode;
  articleCount: number;
  /** Contagem da aba Artigos: SiloPage NUNCA entra como Article. */
  articleScope?: { siloPages: number; articles: number; candidates: number; published: number; waiting: number } | null;
  siloCount: number;
  selectedCount: number;
  activeProcess: ArchitectProcess;
  onProcessChange: (process: ArchitectProcess) => void;
  processes: Record<ArchitectProcess, { state: ArchitectProcessState; onClick?: () => void; disabled?: boolean; title?: string; progress?: string }>;
  /** Projeção da aba Silos. Não é área nova: é outra leitura da mesma mesa. */
  siloView?: "architecture" | "sitemap";
  onSiloViewChange?: (view: "architecture" | "sitemap") => void;
  /** Filtro operacional da projeção Arquitetura; não cria tabela nem rota. */
  siloScope?: SiloScope;
  onSiloScopeChange?: (scope: SiloScope) => void;
  /**
   * Operação principal da aba Silos: processar o lote e confirmar uma vez.
   * Lógica, SERP, IA e Revisão continuam existindo como motores internos —
   * deixam apenas de ser quatro cliques obrigatórios na jornada.
   */
  /**
   * Painel de arquitetura da aba Silos, montado pelo workspace. O Workbench
   * só reserva o lugar: a leitura do lote pertence a quem tem o read-model.
   */
  architecture?: { panel: React.ReactNode } | null;
  /** Mesmo contrato para a fase Artigos: o workbench só reserva o lugar. */
  formation?: { panel: React.ReactNode } | null;
  /**
   * E para a fase Links, que era a última a ainda pedir motor por motor.
   *
   * Mostrar "IA · Bloqueado" e "Revisão · Disponível" descrevia o estado dos
   * motores, não o que a pessoa precisa fazer: processar e confirmar. Links é
   * a fase que FECHA a passada, e fechar precisa ser um ato nomeado.
   */
  links?: { panel: React.ReactNode } | null;
}) {
  const modeLabel = mode === "articles" ? "Artigos" : mode === "silos" ? "Silos" : "Links internos";

  return <section className="shrink-0 border-b border-divider bg-surface px-4 py-3" aria-label="Workbench do Arquiteto" data-testid="architect-workbench">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-module-accent">Workbench do Arquiteto</p>
        <p className="mt-1 text-sm text-text-muted" data-testid="architect-workbench-counts">{modeLabel} · {
          mode === "articles" && articleScope
            // A SiloPage é o pai, não um Article: somá-los inflaria o lote e
            // faria a mesa mentir sobre o tamanho do trabalho.
            ? `${articleScope.siloPages} SiloPage(s) · ${articleScope.articles} Article(s) formado(s) · ${articleScope.candidates} candidato(s) · ${articleScope.published} publicado(s)`
            : mode === "articles" ? `${articleCount} artigo(s)`
              : mode === "silos" ? `${siloCount} silo(s)`
                : "working copy e versões do grafo"
        }{selectedCount ? ` · ${selectedCount} selecionado(s)` : ""}</p>
      </div>
      {/* Projeção da MESMA aba: nenhuma rota, aba ou workspace novo. */}
      {mode === "silos" && onSiloViewChange && (
        <label className="flex items-center gap-2 text-sm text-text-muted" htmlFor="architect-silo-view">
          Visualização:
          <select
            id="architect-silo-view"
            data-testid="architect-silo-view"
            value={siloView}
            onChange={event => onSiloViewChange(event.target.value === "sitemap" ? "sitemap" : "architecture")}
            className="min-h-8 rounded border border-divider bg-surface-subtle px-2 py-1 text-sm text-foreground"
          >
            <option value="architecture">Arquitetura</option>
            <option value="sitemap">Sitemap</option>
          </select>
        </label>
      )}
      {/* Filtro de leitura: nenhuma linha é removida do patrimônio, só do foco. */}
      {mode === "silos" && siloView === "architecture" && onSiloScopeChange && (
        <label className="flex items-center gap-2 text-sm text-text-muted" htmlFor="architect-silo-scope">
          Mostrar:
          <select
            id="architect-silo-scope"
            data-testid="architect-silo-scope"
            value={siloScope}
            onChange={event => onSiloScopeChange(event.target.value as SiloScope)}
            className="min-h-8 rounded border border-divider bg-surface-subtle px-2 py-1 text-sm text-foreground"
          >
            {(Object.keys(SILO_SCOPE_LABELS) as SiloScope[]).map(scope => (
              <option key={scope} value={scope}>{SILO_SCOPE_LABELS[scope]}</option>
            ))}
          </select>
        </label>
      )}
    </div>
    {/* Operação principal: uma ação para entender o lote, outra para
        confirmar o que foi revisado. Os quatro motores continuam abaixo. */}
    {/* Painel único da aba Silos: o que foi encontrado, por que, e o
        que falta confirmar. Substitui os quatro botões de processo. */}
    {mode === "silos" && architecture?.panel}
    {/* Painel único da aba Artigos: o que foi formado, por que, e o que
        falta confirmar. Mesmo padrão operacional de Silos. */}
    {mode === "articles" && formation?.panel}
    {/* Em Silos, Artigos e Links os motores deixam de ser etapas manuais: viram
        leitura do que já rodou, dentro do painel da fase. Processar orquestra
        Lógica, SERP e IA internamente — o humano não aperta motor por motor, e
        confirma uma vez. Links é a fase que FECHA a passada: mostrar "IA ·
        Bloqueado" ali descrevia o estado do motor, não o ato que falta. */}
    {mode === "links" && links?.panel}
  </section>;
}

export type ArchitectMapKeyword = {
  id: string;
  label: string;
  role: "principal" | "secundaria" | "reforco_narrativo" | "unknown";
};

export type ArchitectMapArticle = {
  id: string;
  /** Identidade da linha da working copy; não é a identidade do ArticleDNA. */
  selectionId?: string | null;
  label: string;
  keywords: ArchitectMapKeyword[];
  siloLabel: string | null;
  siloCandidate: boolean;
  published: boolean;
  protected: boolean;
  conflicts: string[];
};

export type ArchitectMapSilo = {
  id: string;
  label: string;
  slug: string | null;
  pillarArticleId: string | null;
  supportArticleIds: string[];
  articleIds: string[];
  conflicts: string[];
  published: boolean;
  source: string;
};

export type ArchitectMapSnapshot = {
  articles: ArchitectMapArticle[];
  silos: ArchitectMapSilo[];
  gains: string[];
  losses: string[];
  changes: string[];
};

type ArchitectureMapProps = {
  mode: ArchitectWorkspaceMode;
  snapshots: Record<ArchitectMapScenario, ArchitectMapSnapshot>;
  expanded: boolean;
  scenario: ArchitectMapScenario;
  compare: boolean;
  selectedArticleIds: ReadonlySet<string>;
  visibleArticleIds: ReadonlySet<string>;
  onExpandedChange: (expanded: boolean) => void;
  onFocusArticle?: (articleId: string) => void;
  /** Projeção dos clusters da análise; só a aba Silos usa. */
  clusterFlow?: ArchitectureFlowProjection | null;
  /** Mapa da aba Artigos: SiloPage → Article → Keyword. */
  articleFlow?: ArticleFlowProjection | null;
  links?: {
    approvedGraph: InternalLinkGraph | null;
    workingCopy: InternalLinkGraphWorkingCopy | null;
    scenario: ArchitectLinksScenario;
    selectedNodeId: string | null;
    selectedEdgeId: string | null;
    onScenarioChange: (scenario: ArchitectLinksScenario) => void;
    nodeDisplay?: Record<string, { slug: string | null; canonical: string | null }>;
    onFocusNode?: (nodeId: string | null) => void;
    onFocusEdge?: (edgeId: string | null) => void;
    onCreateEdge?: (sourceNodeId: string, targetNodeId: string) => void;
  };
  onStateChange?: (state: ArchitectMapState) => void;
  onScenarioChange: (scenario: ArchitectMapScenario) => void;
};

export type ArchitectMapState = {
  scenario: ArchitectMapScenario;
  compare: boolean;
  selectedNodeId: string | null;
  selectedArticleId: string | null;
  selectedKeywordId: string | null;
  selectedSiloId: string | null;
};

const mapScenarioLabels: Record<ArchitectMapScenario, string> = { current: "Atual", logic: "Lógica", serp: "SERP", ai: "IA" };

/** Item do menu de contexto do mapa: neutro em repouso, module-accent na interação. */
const architectMenuItem = "flex w-full items-center px-3 py-2 text-left text-sm text-foreground/85 transition-colors hover:bg-module-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:bg-module-accent/15 focus-visible:text-foreground";

type ArchitectFlowNodeKind = "group" | "keyword" | "silo" | "pillar" | "support";

type ArchitectFlowNodeData = {
  label: string;
  meta: string;
  kind: ArchitectFlowNodeKind;
  changed: boolean;
  ghosted?: boolean;
  roleLabel?: string;
  secondaryLabels?: string[];
};

type ArchitectFlowNode = Node<ArchitectFlowNodeData, "architect" | "architect-group">;

export type ArchitectFlowProjection = {
  nodes: ArchitectFlowNode[];
  edges: Edge[];
};

function encodeFlowPart(value: string) {
  return encodeURIComponent(value);
}

function decodeFlowPart(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function articleFlowId(articleId: string) {
  return `article:${encodeFlowPart(articleId)}`;
}

function keywordFlowId(articleId: string, keywordId: string) {
  return `keyword:${encodeFlowPart(articleId)}:${encodeFlowPart(keywordId)}`;
}

function siloFlowId(siloId: string) {
  return `silo:${encodeFlowPart(siloId)}`;
}

function supportFlowId(siloId: string, articleId: string) {
  return `support:${encodeFlowPart(siloId)}:${encodeFlowPart(articleId)}`;
}

function flowChanged(scenario: ArchitectMapScenario, changes: string[], ...values: string[]) {
  return scenario !== "current" && changes.some(change => values.some(value => value.trim().length > 0 && change.includes(value)));
}

function flowEdge(id: string, source: string, target: string, scenario: ArchitectMapScenario, ghosted = false): Edge {
  return {
    id,
    source,
    target,
    type: "smoothstep",
    selectable: false,
    focusable: false,
    reconnectable: false,
    style: {
      // O token de divisor sumia no fundo escuro: a ligação entre principal e
      // secundária é estrutura visível do agrupamento, não uma linha de apoio.
      stroke: "var(--module-accent)",
      strokeWidth: 1.8,
      opacity: ghosted ? 0.3 : 0.9,
    },
  };
}

function flowNode(
  id: string,
  position: { x: number; y: number },
  data: ArchitectFlowNodeData,
  options: Pick<ArchitectFlowNode, "sourcePosition" | "targetPosition"> & {
    nodeType?: "architect" | "architect-group";
    style?: React.CSSProperties;
    selectable?: boolean;
    focusable?: boolean;
    draggable?: boolean;
    connectable?: boolean;
    zIndex?: number;
  } = {},
): ArchitectFlowNode {
  return {
    id,
    type: options.nodeType || "architect",
    position,
    data,
    sourcePosition: options.sourcePosition || Position.Right,
    targetPosition: options.targetPosition || Position.Left,
    draggable: options.draggable ?? false,
    connectable: options.connectable ?? false,
    selectable: options.selectable ?? true,
    focusable: options.focusable ?? true,
    ...(options.style ? { style: options.style } : {}),
    ...(options.zIndex !== undefined ? { zIndex: options.zIndex } : {}),
    ariaLabel: `${data.label}. ${data.meta}`,
  };
}

function linkFlowEdge(edge: InternalLinkGraphEdge, selected: boolean): Edge {
  return {
    id: edge.edgeId,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    type: "smoothstep",
    selectable: true,
    focusable: true,
    reconnectable: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: selected ? "var(--module-accent)" : "var(--context-accent)" },
    style: {
      stroke: selected ? "var(--module-accent)" : "var(--context-accent)",
      strokeWidth: selected ? 2.4 : 1.8,
    },
    ariaLabel: `${edge.sourceNodeId} para ${edge.targetNodeId} · ${edge.relationType}`,
  };
}

function flowGroupNode(id: string, position: { x: number; y: number }, data: ArchitectFlowNodeData, width: number, height: number) {
  return flowNode(id, position, data, {
    nodeType: "architect-group",
    style: { width, height },
    selectable: false,
    focusable: false,
    zIndex: -1,
  });
}

function secondaryLabelsFor(article: ArchitectMapArticle | undefined) {
  return article?.keywords.filter(keyword => keyword.role !== "principal").map(keyword => keyword.label).slice(0, 5) || [];
}

function normalizedFlowIds(value: ReadonlySet<string> | undefined) {
  return value && value.size > 0 ? value : null;
}

function articlesInFlowScope(
  articles: ArchitectMapArticle[],
  visibleArticleIds: ReadonlySet<string> | undefined,
) {
  if (visibleArticleIds) {
    return articles.filter(article => Boolean(article.selectionId && visibleArticleIds.has(article.selectionId)));
  }
  return articles;
}

/**
 * Largura do nó estimada pelo texto da keyword.
 *
 * A keyword é renderizada sem quebra de linha, então o nó precisa acompanhar o
 * conteúdo — largura fixa cortaria ou empurraria o texto. A estimativa é
 * determinística porque o React Flow posiciona por coordenada, não por fluxo.
 */
const KEYWORD_NODE_MIN_WIDTH = 208;
const KEYWORD_NODE_MAX_WIDTH = 460;
const KEYWORD_NODE_CHAR_WIDTH = 8.15;

export function keywordNodeWidth(label: string) {
  const estimated = 30 + label.trim().length * KEYWORD_NODE_CHAR_WIDTH;
  return Math.round(Math.min(KEYWORD_NODE_MAX_WIDTH, Math.max(KEYWORD_NODE_MIN_WIDTH, estimated)));
}

function keywordRoleLabel(role: ArchitectMapKeyword["role"], ordinal: number) {
  return role === "principal"
    ? "Keyword principal"
    : role === "reforco_narrativo"
      ? `Keyword reforço ${ordinal}`
      : role === "secundaria"
        ? `Keyword secundária ${ordinal}`
        : `Keyword relacionada ${ordinal}`;
}

function internalLinkNodeLabel(node: InternalLinkGraph["nodes"][number]) {
  if (node.nodeType === "SILO_PAGE") return node.snapshot.label || `SiloPage · ${node.snapshot.siloId || "sem silo"}`;
  return node.snapshot.label || `ArticleDNA · ${node.articleDnaVersionRef?.entityId || node.nodeId}`;
}

function internalLinkNodeKind(node: InternalLinkGraph["nodes"][number]): ArchitectFlowNodeKind {
  if (node.nodeType === "SILO_PAGE") return "silo";
  return node.architecturalRole === "PILAR" ? "pillar" : "support";
}

/**
 * Projects only the structural vocabulary of the canonical graph. The graph
 * remains the authority; positions and selection are deliberately absent
 * from the returned domain representation.
 */
export function buildInternalLinkGraphProjection(
  graph: InternalLinkGraph | InternalLinkGraphWorkingCopy | null,
  selectedNodeId: string | null = null,
  selectedEdgeId: string | null = null,
  nodeDisplay: Record<string, { slug: string | null; canonical: string | null }> = {},
): ArchitectFlowProjection {
  if (!graph) return { nodes: [], edges: [] };

  const siloNodes = graph.nodes.filter(node => node.nodeType === "SILO_PAGE");
  const pillarNodes = graph.nodes.filter(node => node.nodeType === "ARTICLE_DNA" && node.architecturalRole === "PILAR");
  const articleNodes = graph.nodes.filter(node => node.nodeType === "ARTICLE_DNA" && node.architecturalRole !== "PILAR");
  const columnX = { silo: 8, pillar: 280, support: 552 } as const;
  const stackGap = 132;
  const articleHeight = 96;
  const articleStackHeight = Math.max(articleHeight, Math.max(pillarNodes.length, articleNodes.length, 1) * stackGap);
  const siloY = Math.max(24, articleStackHeight / 2 - 44);
  const positions = new Map<string, { x: number; y: number }>();

  siloNodes.forEach((node, index) => {
    positions.set(node.nodeId, { x: columnX.silo, y: siloY + index * stackGap });
  });
  pillarNodes.forEach((node, index) => {
    positions.set(node.nodeId, { x: columnX.pillar, y: 24 + index * stackGap });
  });
  articleNodes.forEach((node, index) => {
    positions.set(node.nodeId, { x: columnX.support, y: 24 + index * stackGap });
  });

  const nodes = graph.nodes.map(node => {
    const kind = internalLinkNodeKind(node);
    const display = nodeDisplay[node.nodeId];
    const roleLabel = node.nodeType === "SILO_PAGE"
      ? "SiloPage"
      : node.architecturalRole === "PILAR" ? "Pilar" : node.architecturalRole === "SUPORTE" ? "Suporte" : "ArticleDNA";
    return flowNode(
      node.nodeId,
      positions.get(node.nodeId) || { x: columnX.support, y: 24 },
      {
        label: internalLinkNodeLabel(node),
        meta: [roleLabel, display?.slug ? "/" + display.slug.replace(/^\/+/, "") : null, display?.canonical || null].filter(Boolean).join(" · "),
        kind,
        roleLabel,
        changed: false,
      },
      { sourcePosition: Position.Right, targetPosition: Position.Left, selectable: true, focusable: true },
    );
  }).map(node => ({ ...node, selected: node.id === selectedNodeId }));

  return {
    nodes,
    edges: graph.edges.map(edge => linkFlowEdge(edge, edge.edgeId === selectedEdgeId)),
  };
}

/**
 * Mapa da aba Silos: um Silo (ou Cluster) no centro, keywords ao redor.
 *
 * Converte o read-model puro em nós do canvas. Nenhuma posição é persistida —
 * o mapa é projeção da análise vigente, não a arquitetura.
 */
function buildArchitectureClusterFlow(
  projection: ArchitectureFlowProjection,
  selectedNodeId: string | null,
): ArchitectFlowProjection {
  const nodes = projection.nodes.map(node => {
    const escondidas = node.kind !== "keyword" ? projection.hiddenByCluster[node.clusterRef] ?? 0 : 0;
    const kind: ArchitectFlowNodeKind = node.kind === "keyword" ? "keyword" : node.kind === "cluster" ? "group" : "silo";
    const roleLabel = node.kind === "silo_site"
      ? "Silo · Site"
      : node.kind === "silo_manual" ? "Silo · Manual" : node.kind === "cluster" ? "Cluster" : "KW";
    return flowNode(
      node.id,
      node.position,
      {
        label: node.label,
        meta: [node.meta, escondidas ? `+ ${escondidas} keywords` : null].filter(Boolean).join(" · "),
        kind,
        roleLabel,
        changed: false,
      },
      { sourcePosition: Position.Right, targetPosition: Position.Left, selectable: true, focusable: true },
    );
  }).map(node => ({ ...node, selected: node.id === selectedNodeId }));

  const edges = projection.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    // Tracejada enquanto é sugestão da análise; sólida quando a membership já
    // foi confirmada por decisão humana.
    style: edge.relation === "suggested"
      ? { strokeDasharray: "4 4", strokeWidth: 1 }
      : { strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed },
  }));

  return { nodes, edges } as ArchitectFlowProjection;
}

/**
 * Mapa da aba Artigos: SiloPage na raiz, Articles no meio, keywords embaixo.
 *
 * Cada SiloPage é um cluster fechado — a hierarquia é justamente o que este
 * mapa existe para mostrar. Nenhuma posição é persistida: mover um nó na tela
 * não move keyword nenhuma.
 */
function buildArticleHierarchyFlow(
  projection: ArticleFlowProjection,
  selectedNodeId: string | null,
): ArchitectFlowProjection {
  const KIND: Record<ArticleFlowProjection["nodes"][number]["kind"], ArchitectFlowNodeKind> = {
    silo_page: "silo",
    article: "pillar",
    candidate: "group",
    published: "support",
    keyword: "keyword",
  };
  const ROLE: Record<ArticleFlowProjection["nodes"][number]["kind"], string> = {
    silo_page: "SiloPage",
    article: "Article",
    candidate: "Candidato",
    published: "Article · Publicado",
    keyword: "KW",
  };

  const nodes = projection.nodes.map(node => flowNode(
    node.id,
    node.position,
    {
      label: node.label,
      meta: node.meta || "",
      kind: KIND[node.kind],
      // Na keyword o papel É a informação; nos demais, o tipo do nó.
      roleLabel: node.kind === "keyword" ? (node.meta || "KW") : ROLE[node.kind],
      changed: false,
    },
    { sourcePosition: Position.Bottom, targetPosition: Position.Top, selectable: true, focusable: true },
  )).map(node => ({ ...node, selected: node.id === selectedNodeId }));

  const edges = projection.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    // Tracejada enquanto a composição é proposta; sólida depois do ArticleDNA.
    style: edge.suggested ? { strokeDasharray: "4 4", strokeWidth: 1 } : { strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed },
  }));

  return { nodes, edges } as ArchitectFlowProjection;
}


export function buildArchitectFlowProjection(
  mode: ArchitectWorkspaceMode,
  snapshot: ArchitectMapSnapshot,
  scenario: ArchitectMapScenario,
  selectedNodeId: string | null = null,
  scope: { selectedArticleIds?: ReadonlySet<string>; visibleArticleIds?: ReadonlySet<string> } = {},
  linkGraph: InternalLinkGraph | InternalLinkGraphWorkingCopy | null = null,
  clusterFlow: ArchitectureFlowProjection | null = null,
  articleFlow: ArticleFlowProjection | null = null,
): ArchitectFlowProjection {
  if (mode === "links") return buildInternalLinkGraphProjection(linkGraph, selectedNodeId, null);

  // A aba Silos projeta a ANÁLISE do lote, não a coleção de SiloPages.
  if (mode === "silos" && clusterFlow) return buildArchitectureClusterFlow(clusterFlow, selectedNodeId);
  if (mode === "articles" && articleFlow) return buildArticleHierarchyFlow(articleFlow, selectedNodeId);

  if (mode === "articles") {
    const selected = normalizedFlowIds(scope.selectedArticleIds);
    const articles = articlesInFlowScope(snapshot.articles, scope.visibleArticleIds)
      .filter(article => article.keywords.length > 0);
    // Cada grupo é uma árvore de um nível: a keyword principal em cima e as
    // secundárias/reforços espalhados na HORIZONTAL logo abaixo, ligadas da base
    // da principal ao topo de cada uma. Os grupos, por sua vez, se empilham.
    const groupGap = 20;
    const groupX = 8;
    const groupPadX = 16;
    const keywordGapX = 20;
    const principalRowY = 68;
    const relatedRowY = 176;
    const keywordNodeHeight = 72;
    let groupY = 8;
    const nodes: ArchitectFlowNode[] = [];
    const edges: Edge[] = [];
    articles.forEach(article => {
      const ghosted = Boolean(selected && (!article.selectionId || !selected.has(article.selectionId)));
      const principal = article.keywords.find(keyword => keyword.role === "principal") || article.keywords[0];
      const related = article.keywords.filter(keyword => keyword.id !== principal?.id);
      const principalWidth = keywordNodeWidth(principal?.label || article.label);
      const relatedWidths = related.map(keyword => keywordNodeWidth(keyword.label));
      const relatedRowWidth = relatedWidths.reduce((total, width) => total + width, 0)
        + Math.max(0, related.length - 1) * keywordGapX;
      const contentWidth = Math.max(principalWidth, relatedRowWidth);
      const groupWidth = groupPadX * 2 + contentWidth;
      const groupHeight = related.length > 0
        ? relatedRowY + keywordNodeHeight + 16
        : principalRowY + keywordNodeHeight + 16;
      const groupMeta = [
        `${article.keywords.length} keyword(s)`,
        article.siloCandidate ? "candidata reservada" : null,
        article.conflicts.length ? "conflito" : null,
        article.published ? "publicado" : null,
      ].filter(Boolean).join(" · ");
      nodes.push(flowGroupNode(
        `group:${encodeFlowPart(article.id)}`,
        { x: groupX, y: groupY },
        {
          label: article.siloCandidate ? `Candidata reservada · ${article.label}` : `Grupo · ${article.label}`,
          meta: groupMeta,
          kind: "group",
          changed: flowChanged(scenario, snapshot.changes, article.id, article.label),
          ghosted,
        },
        groupWidth,
        groupHeight,
      ));
      if (!principal) {
        groupY += groupHeight + groupGap;
        return;
      }
      // A principal fica centralizada sobre a linha das secundárias.
      const contentX = groupX + groupPadX;
      nodes.push(flowNode(
        keywordFlowId(article.id, principal.id),
        { x: contentX + (contentWidth - principalWidth) / 2, y: groupY + principalRowY },
        {
          label: principal.label,
          meta: "Principal",
          kind: "keyword",
          roleLabel: keywordRoleLabel("principal", 1),
          changed: flowChanged(scenario, snapshot.changes, article.id, principal.id, principal.label),
          ghosted,
        },
        { sourcePosition: Position.Bottom, targetPosition: Position.Top, style: { width: principalWidth } },
      ));
      const roleOrdinals = new Map<ArchitectMapKeyword["role"], number>();
      let relatedX = contentX + (contentWidth - relatedRowWidth) / 2;
      related.forEach((keyword, relatedIndex) => {
        const ordinal = (roleOrdinals.get(keyword.role) || 0) + 1;
        roleOrdinals.set(keyword.role, ordinal);
        const roleLabel = keywordRoleLabel(keyword.role, ordinal);
        const keywordWidth = relatedWidths[relatedIndex];
        nodes.push(flowNode(
          keywordFlowId(article.id, keyword.id),
          { x: relatedX, y: groupY + relatedRowY },
          {
            label: keyword.label,
            meta: roleLabel,
            kind: "keyword",
            roleLabel,
            changed: flowChanged(scenario, snapshot.changes, article.id, keyword.id, keyword.label),
            ghosted,
          },
          { sourcePosition: Position.Bottom, targetPosition: Position.Top, style: { width: keywordWidth } },
        ));
        relatedX += keywordWidth + keywordGapX;
        edges.push(flowEdge(
          `keyword-edge:${encodeFlowPart(article.id)}:${encodeFlowPart(keyword.id)}`,
          keywordFlowId(article.id, principal.id),
          keywordFlowId(article.id, keyword.id),
          scenario,
          ghosted,
        ));
      });
      groupY += groupHeight + groupGap;
    });
    return { nodes: nodes.map(node => ({ ...node, selected: node.id === selectedNodeId })), edges };
  }

  const articleById = new Map(snapshot.articles.map(article => [article.id, article]));
  const nodes: ArchitectFlowNode[] = [];
  const edges: Edge[] = [];
  const siloPageColumnX = 8;
  const pillarColumnX = 280;
  const supportColumnX = 552;
  const siloGap = 32;
  const supportNodeHeight = 132;
  const supportStep = 148;
  let siloY = 18;
  snapshot.silos.forEach(silo => {
    const supportArticleIds = silo.supportArticleIds.slice(0, 6);
    const supportStackHeight = supportArticleIds.length > 0
      ? supportNodeHeight + (supportArticleIds.length - 1) * supportStep
      : 0;
    const siloHeight = Math.max(164, supportStackHeight + 24);
    const centeredNodeY = siloY + Math.max(12, (siloHeight - supportNodeHeight) / 2);
    const supportStartY = supportArticleIds.length > 0
      ? siloY + Math.max(12, (siloHeight - supportStackHeight) / 2)
      : centeredNodeY;
    nodes.push(flowNode(
      siloFlowId(silo.id),
      { x: siloPageColumnX, y: centeredNodeY },
      {
        label: `SiloPage · ${silo.label}`,
        meta: silo.slug ? "/" + silo.slug.replace(/^\/+/, "") : "slug pendente",
        kind: "silo",
        changed: flowChanged(scenario, snapshot.changes, silo.id, silo.label),
      },
      { sourcePosition: Position.Right, targetPosition: Position.Left },
    ));
    const summary = (articleId: string, kind: "pillar" | "support") => {
      const article = articleById.get(articleId);
      return {
        label: article?.label || articleId,
        meta: kind === "pillar" ? "Pilar" : "Suporte",
        kind,
        changed: flowChanged(scenario, snapshot.changes, articleId, article?.label || ""),
        roleLabel: kind === "pillar" ? "Pilar" : "Suporte",
        secondaryLabels: secondaryLabelsFor(article),
      } satisfies ArchitectFlowNodeData;
    };
    if (silo.pillarArticleId) {
      nodes.push(flowNode(
        articleFlowId(silo.pillarArticleId),
        { x: pillarColumnX, y: centeredNodeY },
        summary(silo.pillarArticleId, "pillar"),
        { sourcePosition: Position.Right, targetPosition: Position.Left },
      ));
      edges.push(flowEdge(`silo-pillar:${encodeFlowPart(silo.id)}`, siloFlowId(silo.id), articleFlowId(silo.pillarArticleId), scenario));
    }
    supportArticleIds.forEach((articleId, supportIndex) => {
      const supportNodeId = supportFlowId(silo.id, articleId);
      nodes.push(flowNode(
        supportNodeId,
        { x: supportColumnX, y: supportStartY + supportIndex * supportStep },
        summary(articleId, "support"),
        { sourcePosition: Position.Right, targetPosition: Position.Left },
      ));
      edges.push(flowEdge(
        `silo-support:${encodeFlowPart(silo.id)}:${encodeFlowPart(articleId)}`,
        silo.pillarArticleId ? articleFlowId(silo.pillarArticleId) : siloFlowId(silo.id),
        supportNodeId,
        scenario,
      ));
    });
    siloY += siloHeight + siloGap;
  });
  return { nodes: nodes.map(node => ({ ...node, selected: node.id === selectedNodeId })), edges };
}

function ArchitectFlowGroupView({ data }: NodeProps<ArchitectFlowNode>) {
  return <div className={`pointer-events-none h-full w-full rounded-lg border px-3 py-2 ${data.ghosted ? "opacity-35" : ""} ${data.changed ? "border-warning/45 bg-warning/5" : "border-divider bg-surface-subtle/55"}`} aria-label={`${data.label}. ${data.meta}`}>
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Grupo</p>
    <p className="mt-1 break-words text-sm font-semibold text-foreground" title={data.label}>{data.label}</p>
    <p className="mt-1 break-words text-sm text-text-muted" title={data.meta}>{data.meta}</p>
  </div>;
}

function ArchitectFlowNodeView({ data, selected, targetPosition, sourcePosition, id }: NodeProps<ArchitectFlowNode>) {
  const tone = data.changed
    ? "border-warning/55 bg-warning/10"
    : data.kind === "silo"
      ? "border-module-accent/50 bg-surface"
      : data.kind === "pillar"
        ? "border-context-accent/55 bg-context-accent/10"
        : "border-divider bg-surface-elevated";
  const kindLabel = data.kind === "silo" ? "SiloPage" : data.kind === "pillar" ? "Pilar" : data.kind === "support" ? "Suporte" : "Keyword";
  const ghostTone = data.ghosted ? "opacity-40" : "";
  const keyword = data.kind === "keyword";
  return <div className={`nopan relative min-h-16 w-full rounded-lg border px-3 py-2 shadow-sm transition-colors ${tone} ${ghostTone} ${selected ? "ring-2 ring-module-accent/45" : ""}`} data-testid={`architect-flow-node-${id}`} aria-label={`${data.label}. ${data.meta}`}>
    <Handle type="target" position={targetPosition || Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-transparent !opacity-0" />
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{data.roleLabel || kindLabel}</p>
    <p className={`mt-1 font-semibold ${keyword ? "whitespace-nowrap text-base leading-6 text-keyword" : "break-words whitespace-normal text-sm text-foreground"}`} title={data.label}>{data.label}</p>
    {!keyword && <p className="mt-1 break-words whitespace-normal text-sm text-text-muted" title={data.meta}>{data.meta}</p>}
    {data.secondaryLabels && data.secondaryLabels.length > 0 && <p className="mt-1 break-words whitespace-normal text-sm leading-5 text-text-muted" title={data.secondaryLabels.join(" · ")}>Secundárias/reforços · {data.secondaryLabels.join(" · ")}</p>}
    <Handle type="source" position={sourcePosition || Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-transparent !opacity-0" />
  </div>;
}

const architectFlowNodeTypes = { architect: ArchitectFlowNodeView, "architect-group": ArchitectFlowGroupView };

function ArchitectFlowViewportController({ fitKey, enabled, minZoom }: { fitKey: string; enabled: boolean; minZoom: number }) {
  const { fitView } = useReactFlow<ArchitectFlowNode>();
  React.useEffect(() => {
    if (!enabled) return undefined;
    const timeoutId = setTimeout(() => {
      void fitView({ padding: 0.06, minZoom, maxZoom: 1.15 });
    }, 40);
    return () => clearTimeout(timeoutId);
  }, [enabled, fitKey, fitView, minZoom]);
  return null;
}

export function ArchitectArchitectureMap({ mode, snapshots, expanded, scenario, compare, selectedArticleIds, visibleArticleIds, onExpandedChange, onFocusArticle, clusterFlow, articleFlow, links, onStateChange, onScenarioChange }: ArchitectureMapProps) {
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [flowColorMode, setFlowColorMode] = React.useState<"dark" | "light">("dark");
  const [linkNodePositions, setLinkNodePositions] = React.useState<Record<string, { x: number; y: number }>>({});
  const snapshot = snapshots[scenario];
  const activeLinkGraph = mode === "links" ? (links?.scenario === "working" ? links.workingCopy : links?.approvedGraph) : null;
  const activeSelectedNodeId = mode === "links" ? links?.selectedNodeId ?? selectedNodeId : selectedNodeId;
  const projection = React.useMemo(() => mode === "links"
    ? buildInternalLinkGraphProjection(activeLinkGraph || null, activeSelectedNodeId, links?.selectedEdgeId || null, links?.nodeDisplay)
    : buildArchitectFlowProjection(mode, snapshot, scenario, selectedNodeId, { selectedArticleIds, visibleArticleIds }, null, clusterFlow || null, articleFlow || null),
  [activeLinkGraph, activeSelectedNodeId, articleFlow, clusterFlow, links?.nodeDisplay, links?.selectedEdgeId, mode, scenario, selectedArticleIds, selectedNodeId, snapshot, visibleArticleIds]);
  const linksEditable = mode === "links" && links?.scenario === "working";
  const selectedArticleId = selectedNodeId?.startsWith("article:")
    ? decodeFlowPart(selectedNodeId.slice("article:".length))
    : selectedNodeId?.startsWith("keyword:")
      ? decodeFlowPart(selectedNodeId.slice("keyword:".length).split(":")[0])
      : selectedNodeId?.startsWith("support:")
        ? decodeFlowPart(selectedNodeId.slice("support:".length).split(":")[1] || "")
        : null;
  const selectedSiloId = selectedNodeId?.startsWith("silo:")
    ? decodeFlowPart(selectedNodeId.slice("silo:".length))
    : selectedNodeId?.startsWith("support:")
      ? decodeFlowPart(selectedNodeId.slice("support:".length).split(":")[0])
      : null;
  const selectedKeywordId = selectedNodeId?.startsWith("keyword:")
    ? decodeFlowPart(selectedNodeId.slice("keyword:".length).split(":").slice(1).join(":"))
    : null;

  React.useEffect(() => {
    const updateColorMode = () => {
      const root = document.documentElement;
      setFlowColorMode(root.dataset.theme === "light" || root.classList.contains("light") ? "light" : "dark");
    };
    updateColorMode();
    const observer = new MutationObserver(updateColorMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (mode === "links") return;
    onStateChange?.({ scenario, compare, selectedNodeId, selectedArticleId, selectedKeywordId, selectedSiloId });
  }, [compare, mode, onStateChange, scenario, selectedArticleId, selectedKeywordId, selectedNodeId, selectedSiloId]);

  /**
   * Menu de contexto do mapa (padrão context-menu do React Flow).
   *
   * O mapa é projeção: o menu navega e inspeciona, nunca reescreve agrupamento,
   * papel da keyword ou identidade. Edição de aresta continua exclusiva do modo
   * Links, onde existe working copy versionada.
   */
  const [nodeMenu, setNodeMenu] = React.useState<{ id: string; label: string; kind: ArchitectFlowNodeKind; top: number; left: number } | null>(null);
  const closeNodeMenu = React.useCallback(() => setNodeMenu(null), []);
  const canvasRef = React.useRef<HTMLDivElement | null>(null);

  const selectNode = (id: string) => {
    setSelectedNodeId(id);
    if (mode === "links") {
      links?.onFocusNode?.(id);
      return;
    }
    if (onFocusArticle) {
      if (id.startsWith("article:")) onFocusArticle(decodeFlowPart(id.slice("article:".length)));
      if (id.startsWith("keyword:")) onFocusArticle(decodeFlowPart(id.slice("keyword:".length).split(":")[0]));
      if (id.startsWith("support:")) onFocusArticle(decodeFlowPart(id.slice("support:".length).split(":")[1] || ""));
    }
  };

  const handleScenarioChange = (nextScenario: ArchitectMapScenario) => {
    setSelectedNodeId(null);
    onScenarioChange(nextScenario);
  };

  const handleLinkScenarioChange = (nextScenario: ArchitectLinksScenario) => {
    setSelectedNodeId(null);
    links?.onFocusNode?.(null);
    links?.onFocusEdge?.(null);
    links?.onScenarioChange(nextScenario);
  };

  const handleNodesChange = React.useCallback((changes: NodeChange<ArchitectFlowNode>[]) => {
    if (!linksEditable) return;
    setLinkNodePositions(previous => {
      let changed = false;
      const next = { ...previous };
      changes.forEach(change => {
        if (change.type === "position" && change.position) {
          next[change.id] = change.position;
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [linksEditable]);

  const handleConnect = React.useCallback((connection: Connection) => {
    if (linksEditable && connection.source && connection.target) links?.onCreateEdge?.(connection.source, connection.target);
  }, [links, linksEditable]);

  const flowNodes = mode === "links"
    ? projection.nodes.map(node => ({ ...node, position: linkNodePositions[node.id] || node.position, draggable: linksEditable, connectable: linksEditable }))
    : projection.nodes;
  const linkScenarioLabels: Record<ArchitectLinksScenario, string> = { approved: "Aprovado", working: "Working copy" };
  const activeLinkProjectionKey = activeLinkGraph ? ("graphVersionId" in activeLinkGraph ? activeLinkGraph.graphVersionId : activeLinkGraph.workingCopyId) : "none";

  const ToggleIcon = expanded ? ChevronUp : ChevronDown;
  /**
   * Recolhido tem um terço da tela: sem um piso de zoom menor o `fitView` não
   * consegue recuar o bastante e parte do grafo fica fora da área visível, sem
   * rolagem para alcançá-la. Aberto volta ao piso legível.
   */
  const fitMinZoom = expanded ? 0.35 : 0.12;
  return <div className="relative min-w-0" data-testid="architect-architecture-map" aria-label="Mapa comparativo de arquitetura">
    <button
      type="button"
      data-testid="architect-map-toggle"
      aria-label={expanded ? "Recolher mapa" : "Expandir mapa"}
      title={expanded ? "Recolher mapa" : "Expandir mapa"}
      onClick={() => onExpandedChange(!expanded)}
      className="absolute left-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded border border-divider bg-surface/95 text-text-muted shadow-sm transition-colors hover:border-module-accent/45 hover:text-module-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/35"
    >
      <ToggleIcon className="h-4 w-4" aria-hidden="true" />
    </button>
    {/*
      Recolhido (padrão) ocupa a metade superior sem sobra; a seta abre para
      72vh, quando também aparecem Controls e MiniMap.
      `overflow-hidden` porque o React Flow faz pan e zoom próprios — barra de
      rolagem aqui é rolagem concorrente com o gesto do mapa.
    */}
    <div ref={canvasRef} className={`relative min-w-0 overflow-hidden rounded-lg border border-divider bg-background ${expanded ? "h-[clamp(24rem,72vh,56rem)]" : "h-[clamp(12rem,33vh,24rem)]"}`} data-testid="architect-flow-canvas">
      {/*
        O viewport do React Flow é o próprio canvas (`h-full`). Antes esta div
        recebia a altura do conteúdo e a rolagem externa fazia a navegação, o
        que produzia a barra vertical. Agora quem navega é pan/zoom, e o
        `fitView` passa a enquadrar a área realmente visível.
      */}
      <div className="relative h-full w-full">
        <ReactFlow
          nodes={flowNodes}
          edges={projection.edges}
          nodeTypes={architectFlowNodeTypes}
          onNodeClick={(_, node) => { closeNodeMenu(); selectNode(node.id); }}
          onNodeContextMenu={(event, node) => {
            event.preventDefault();
            const bounds = canvasRef.current?.getBoundingClientRect();
            const data = node.data as ArchitectFlowNodeData;
            setNodeMenu({
              id: node.id,
              label: data.label,
              kind: data.kind,
              top: event.clientY - (bounds?.top || 0),
              left: event.clientX - (bounds?.left || 0),
            });
          }}
          onMoveStart={closeNodeMenu}
          onEdgeClick={(_, edge) => mode === "links" && links?.onFocusEdge?.(edge.id)}
          onPaneClick={() => { closeNodeMenu(); setSelectedNodeId(null); if (mode === "links") { links?.onFocusNode?.(null); links?.onFocusEdge?.(null); } }}
          onNodesChange={linksEditable ? handleNodesChange : undefined}
          onConnect={linksEditable ? handleConnect : undefined}
          nodesDraggable={Boolean(linksEditable)}
          nodesConnectable={Boolean(linksEditable)}
          elementsSelectable
          nodesFocusable
          edgesFocusable={mode === "links"}
          selectNodesOnDrag={false}
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick
          fitView
          fitViewOptions={{ padding: 0.06, minZoom: fitMinZoom, maxZoom: 1.15 }}
          minZoom={fitMinZoom}
          maxZoom={1.25}
          colorMode={flowColorMode}
          proOptions={{ hideAttribution: true }}
          aria-label={mode === "links" ? `InternalLinkGraph · ${links?.scenario === "working" ? "working copy" : "versão aprovada"}` : `Cenário ${mapScenarioLabels[scenario]}`}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--divider)" />
          {expanded && <Controls position="top-left" className="!left-2 !top-12" showInteractive={false} aria-label="Controles de navegação do mapa" />}
          {expanded && <MiniMap<ArchitectFlowNode> position="bottom-right" pannable zoomable ariaLabel="Visão geral do mapa" style={{ width: 132, height: 88 }} nodeColor={node => node.data.kind === "pillar" ? "var(--context-accent)" : node.data.kind === "silo" || node.data.kind === "group" ? "var(--module-accent)" : "var(--divider)"} nodeStrokeColor="var(--divider)" />}
          <Panel position="top-right" className="!right-2 !top-2 !m-0" data-testid="architect-map-scenarios">
            <div className="flex flex-col items-stretch gap-1 rounded-md border border-divider bg-surface/95 p-1 shadow-sm" role="tablist" aria-label="Visão do mapa">
              {/* Estes quatro têm o nome dos motores e NÃO são processos: são
                  leituras do mesmo mapa. Sem dizer isso, eles pareciam a
                  jornada manual que a fase Artigos deixou de ter. */}
              <p className="px-1 pb-0.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-text-muted" data-testid="architect-map-scenarios-title">Visão do mapa</p>
              {mode === "links"
                ? (Object.keys(linkScenarioLabels) as ArchitectLinksScenario[]).map(option => <button key={option} type="button" role="tab" aria-selected={links?.scenario === option} aria-controls="architect-flow-canvas" onClick={() => handleLinkScenarioChange(option)} className={`min-h-9 min-w-[4.75rem] rounded border px-2 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/35 ${links?.scenario === option ? "border-module-accent/50 bg-module-accent/10 text-module-accent" : "border-transparent bg-transparent text-text-muted hover:border-divider hover:text-foreground"}`}>{linkScenarioLabels[option]}</button>)
                : mode === "silos" ? null : (Object.keys(mapScenarioLabels) as ArchitectMapScenario[]).map(option => <button key={option} type="button" role="tab" aria-selected={scenario === option} aria-controls="architect-flow-canvas" onClick={() => handleScenarioChange(option)} className={`min-h-9 min-w-[4.75rem] rounded border px-2 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/35 ${scenario === option ? "border-module-accent/50 bg-module-accent/10 text-module-accent" : "border-transparent bg-transparent text-text-muted hover:border-divider hover:text-foreground"}`}>{mapScenarioLabels[option]}</button>)}
            </div>
          </Panel>
          {!projection.nodes.length && <Panel position="top-left" className="!left-3 !top-3 !m-0 rounded border border-divider bg-surface/90 px-3 py-2 text-sm text-text-muted">Nenhuma projeção disponível neste cenário.</Panel>}
          <ArchitectFlowViewportController enabled minZoom={fitMinZoom} fitKey={`${mode}:${mode === "links" ? `${links?.scenario}:${activeLinkProjectionKey}` : scenario}:${expanded}:${projection.nodes.length}:${projection.edges.length}`} />
        </ReactFlow>
        {nodeMenu && <div
          role="menu"
          aria-label={`Ações do nó ${nodeMenu.label}`}
          data-testid="architect-flow-context-menu"
          style={{ top: nodeMenu.top, left: nodeMenu.left }}
          className="absolute z-30 w-60 overflow-hidden rounded-lg border border-divider bg-surface-elevated shadow-lg"
          onMouseLeave={closeNodeMenu}
        >
          <div className="border-b border-divider px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-context-accent">{nodeMenu.kind === "keyword" ? "Keyword" : nodeMenu.kind === "group" ? "Grupo" : nodeMenu.kind === "silo" ? "SiloPage" : nodeMenu.kind === "pillar" ? "Pilar" : "Suporte"}</p>
            <p className={`mt-0.5 break-words text-sm font-semibold ${nodeMenu.kind === "keyword" ? "text-keyword" : "text-foreground"}`} title={nodeMenu.label}>{nodeMenu.label}</p>
          </div>
          <button type="button" role="menuitem" className={architectMenuItem} onClick={() => { selectNode(nodeMenu.id); closeNodeMenu(); }}>Abrir na planilha</button>
          <button type="button" role="menuitem" className={architectMenuItem} onClick={() => { void navigator.clipboard?.writeText(nodeMenu.label); closeNodeMenu(); }}>Copiar texto</button>
          <button type="button" role="menuitem" className={`${architectMenuItem} border-t border-divider text-text-muted`} onClick={closeNodeMenu}>Fechar</button>
        </div>}
      </div>
    </div>
  </div>;
}

/* A planilha canônica é composta pelo workspace; este módulo só fornece o Workbench e a projeção visual. */
