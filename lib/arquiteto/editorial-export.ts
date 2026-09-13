/**
 * EDITORIAL_EXPORT_V1 — o arquivo para escrever o artigo, não para salvar o banco.
 *
 * Uma linha por ArticleDNA canônico. O escritor (pessoa, agente, Sheets,
 * Notion ou outro CMS) precisa do PLANO do artigo: quem é o Silo, qual é o
 * papel, qual é a Principal, o que o KeywordDNA já congelou, o que a SERP
 * disse e como o artigo se liga aos vizinhos. Não precisa navegar pelo modelo
 * relacional do MineKey.
 *
 * Por isso os dados de Links entram AGREGADOS na linha do Article: catorze
 * arestas não podem virar catorze linhas num arquivo cuja unidade é o artigo.
 *
 * Contrato deliberadamente ONE-WAY: este arquivo não repopula o Arquiteto.
 * UUID interno, hash, version id, lock version e id de nó do grafo ficam de
 * fora — restaurar estado é trabalho do BACKUP_RESTORABLE_V1.
 */

import { ARQUITETO_CSV_MIME_TYPE, buildCsv, fileNameTimestamp, slugifyForFileName } from "./csv.ts";
import {
  ArquitetoExportError,
  articleExportLabel,
  buildSiloRoleResolver,
  graphFacts,
  keywordLabel,
  keywordMetric,
  principalReference,
  siloLabel,
  type ArquitetoExportInput,
  type ArquitetoExportSilo,
  type KeywordReference,
} from "./export-source.ts";
import { LINK_RELATION_LABELS } from "./internal-link-projection.ts";
import type { ArticleDNA, VersionEnvelope } from "./contracts.ts";

export const EDITORIAL_EXPORT_CONTRACT_ID = "EDITORIAL_EXPORT_V1";

/** Cabeçalhos em português: o arquivo é lido por quem escreve, não pelo banco. */
export const EDITORIAL_EXPORT_HEADER = [
  "Silo",
  "Papel no Silo",
  "Keyword principal",
  "Slug",
  "Intenção",
  "Funil",
  "Volume",
  "Resultados",
  "KGR",
  "Aplicabilidade",
  "Secundárias",
  "Reforços",
  "Entidade central",
  "Modificadores",
  "Público",
  "Problema percebido",
  "Resultado desejado",
  "Tipo editorial",
  "Nível de consciência",
  "Etapa da jornada",
  "Promessa",
  "Ângulo",
  "Cobertura",
  "Fronteira anticanibalização",
  "Parecer SERP",
  "Mercado observado",
  "Evidências necessárias",
  "Fontes necessárias",
  "Recebe links de",
  "Aponta links para",
  "Conceitos de âncora",
  "Relações internas",
  "Status editorial",
] as const;

/**
 * Colunas proibidas neste contrato. A lista existe como regra verificável, e
 * não como intenção no comentário: o teste a usa para provar que nenhum id
 * interno voltou a vazar para o arquivo de produção.
 */
export const EDITORIAL_EXPORT_FORBIDDEN_FIELDS = [
  "brand_id",
  "edge_id",
  "graph_id",
  "version_id",
  "content_hash",
  "created_by",
  "source_node_id",
  "target_node_id",
  "lock_version",
] as const;

export type ArquitetoEditorialArtifact = {
  contract: typeof EDITORIAL_EXPORT_CONTRACT_ID;
  fileName: string;
  mimeType: string;
  content: string;
  rowCount: number;
  summary: string;
};

const ROLE_LABELS: Record<string, string> = { PILAR: "Pilar", SUPORTE: "Suporte", SILOPAGE: "SiloPage", OUTRO: "Sem papel declarado" };
const KEYWORD_INTENT_LABELS: Record<string, string> = {
  informational: "Informacional",
  commercial_investigation: "Comercial investigativa",
  transactional: "Transacional",
  navigational: "Navegacional",
  local: "Local",
};
const EDITORIAL_TYPE_LABELS: Record<string, string> = {
  guide: "Guia",
  tutorial: "Tutorial",
  review: "Review",
  comparison: "Comparativo",
  best_list: "Lista dos melhores",
  individual_product: "Produto individual",
  category: "Categoria",
  problem_solution: "Problema e solução",
  question: "Pergunta",
};

type LinkAggregate = {
  inbound: string[];
  outbound: string[];
  anchors: string[];
  relations: string[];
};

function emptyLinks(): LinkAggregate {
  return { inbound: [], outbound: [], anchors: [], relations: [] };
}

/**
 * Agrega o grafo por Article. O nome de cada ponta é o rótulo editorial —
 * keyword da Principal ou H1 da SiloPage — porque `article:uuid` não ajuda
 * ninguém a escrever.
 */
function aggregateLinks(
  silos: readonly ArquitetoExportSilo[],
  articlesById: ReadonlyMap<string, VersionEnvelope<ArticleDNA>>,
  keywordLabelById?: ReadonlyMap<string, string>,
): Map<string, LinkAggregate> {
  const byArticle = new Map<string, LinkAggregate>();
  const ensure = (articleId: string) => {
    const current = byArticle.get(articleId);
    if (current) return current;
    const created = emptyLinks();
    byArticle.set(articleId, created);
    return created;
  };

  for (const silo of silos) {
    if (!silo.graph) continue;
    const facts = graphFacts(silo.graph);
    const nodesById = new Map(facts.nodes.map(node => [node.nodeId, node]));
    const nameOf = (nodeId: string) => {
      const node = nodesById.get(nodeId);
      if (!node) return nodeId;
      if (node.nodeType === "SILO_PAGE") return silo.siloPage?.payload.h1?.trim() || siloLabel(silo);
      const articleId = node.articleDnaVersionRef?.entityId ?? "";
      const version = articlesById.get(articleId);
      return version ? articleExportLabel(version, keywordLabelById) : node.snapshot.label || articleId;
    };
    const articleIdOf = (nodeId: string) => {
      const node = nodesById.get(nodeId);
      return node?.nodeType === "ARTICLE_DNA" ? node.articleDnaVersionRef?.entityId ?? "" : "";
    };

    for (const edge of facts.edges) {
      const sourceName = nameOf(edge.sourceNodeId);
      const targetName = nameOf(edge.targetNodeId);
      const relationLabel = LINK_RELATION_LABELS[edge.relationType] ?? edge.relationType;
      const description = `${sourceName} → ${targetName} [${relationLabel}]: ${edge.reason}`;
      const sourceArticle = articleIdOf(edge.sourceNodeId);
      const targetArticle = articleIdOf(edge.targetNodeId);
      if (sourceArticle) {
        const entry = ensure(sourceArticle);
        entry.outbound.push(targetName);
        entry.relations.push(description);
        for (const anchor of edge.anchorConcepts) if (!entry.anchors.includes(anchor)) entry.anchors.push(anchor);
      }
      if (targetArticle) {
        const entry = ensure(targetArticle);
        entry.inbound.push(sourceName);
        if (!entry.relations.includes(description)) entry.relations.push(description);
      }
    }
  }
  return byArticle;
}

function keywordDna(reference: KeywordReference | null) {
  return reference?.keywordDnaSnapshot?.payload ?? null;
}

export function editorialExportFileName(brandLabel: string | null | undefined, now: Date): string {
  return `arquiteto-editorial-${slugifyForFileName(brandLabel?.trim() || "brand")}-${fileNameTimestamp(now)}.csv`;
}

export function buildArquitetoEditorialExport(input: ArquitetoExportInput): ArquitetoEditorialArtifact {
  if (input.articles.length === 0) {
    throw new ArquitetoExportError("NO_ARTICLES", "Nenhum ArticleDNA canônico carregado para esta Marca.");
  }
  const articlesById = new Map(input.articles.map(version => [version.payload.articleId, version]));
  const siloById = new Map(input.silos.map(silo => [silo.siloDna.payload.siloId, silo]));
  const siloRoleOf = buildSiloRoleResolver(input.silos, articlesById, input.keywordLabelById);
  const links = aggregateLinks(input.silos, articlesById, input.keywordLabelById);
  const readModelOf = input.articleReadModelOf ?? (() => null);
  const workflowStatusOf = input.workflowStatusOf ?? (() => null);

  const rows = input.articles.map(version => {
    const article = version.payload;
    const principal = principalReference(article);
    const dna = keywordDna(principal);
    const byId = new Map(article.keywordReferences.map(reference => [reference.keywordId, reference]));
    const labelsOf = (ids: readonly string[]) => ids.map(id => {
      const reference = byId.get(id);
      return reference ? keywordLabel(reference, input.keywordLabelById) : input.keywordLabelById?.get(id) || id;
    });
    const { siloId, role } = siloRoleOf(article);
    const silo = siloId ? siloById.get(siloId) : undefined;
    const readModel = readModelOf(article.articleId);
    const classification = article.classification;
    const metrics = article.primaryKeywordMetrics;
    const linkAggregate = links.get(article.articleId) || emptyLinks();

    return [
      silo ? siloLabel(silo) : "Sem Silo",
      ROLE_LABELS[role] ?? "",
      articleExportLabel(version, input.keywordLabelById),
      article.suggestedSlug,
      classification?.intent.value ?? readModel?.intent ?? principal?.originalIntentLabel ?? (dna ? KEYWORD_INTENT_LABELS[dna.searchIntent] ?? dna.searchIntent : article.mainIntent),
      classification?.funnel.value ?? readModel?.funnel ?? article.journeyStage,
      metrics?.volumeSearch ?? keywordMetric(principal, "volume"),
      metrics?.resultCount ?? keywordMetric(principal, "resultCount"),
      metrics?.kgrScore ?? keywordMetric(principal, "kgrScore"),
      classification?.kgrApplicability.value ?? readModel?.kgrApplicability ?? "",
      labelsOf(article.secondaryKeywordIds),
      labelsOf(article.narrativeReinforcementIds),
      dna?.centralEntity ?? "",
      dna?.modifiers ?? [],
      dna?.audience ?? article.audience,
      dna?.perceivedProblem ?? article.problem,
      dna?.desiredResult ?? article.desiredResult,
      dna ? EDITORIAL_TYPE_LABELS[dna.likelyEditorialType] ?? dna.likelyEditorialType : "",
      dna?.awarenessLevel ?? "",
      dna?.journeyStage ?? article.journeyStage,
      article.promise,
      article.angle,
      article.coverage,
      article.antiCannibalizationBoundary,
      readModel?.serpVerdict ?? "",
      readModel?.serpImpact ?? "",
      article.evidenceNeeded,
      article.sourcesNeeded,
      linkAggregate.inbound,
      linkAggregate.outbound,
      linkAggregate.anchors,
      linkAggregate.relations,
      workflowStatusOf(article.articleId) ?? "",
    ];
  });

  const silos = new Set(rows.map(row => row[0]).filter(value => value !== "Sem Silo"));
  const comLinks = rows.filter((_, index) => {
    const aggregate = links.get(input.articles[index].payload.articleId);
    return Boolean(aggregate && (aggregate.inbound.length || aggregate.outbound.length));
  }).length;

  return {
    contract: EDITORIAL_EXPORT_CONTRACT_ID,
    fileName: editorialExportFileName(input.brandLabel, input.now ?? new Date()),
    mimeType: ARQUITETO_CSV_MIME_TYPE,
    content: buildCsv([...EDITORIAL_EXPORT_HEADER], rows),
    rowCount: rows.length,
    summary: `Exportado: ${rows.length} artigo(s) · ${silos.size} Silo(s) · ${comLinks} com links internos.`,
  };
}
