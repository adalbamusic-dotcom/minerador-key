/**
 * EDITORIAL_EXPORT_V1 · keywords-dna.csv — o DNA de cada termo do artigo.
 *
 * O arquivo de artigos entrega a unidade editorial; este entrega os membros
 * dela. Uma linha por keyword de cada ArticleDNA exportado, com o KeywordDNA
 * DAQUELA keyword — não o da Principal repetido. É essa diferença que sustenta
 * reforço semântico de verdade: o reforço existe justamente porque cobre uma
 * intenção, um nível de consciência ou uma entidade que a Principal não cobre,
 * e copiar o DNA dela apagaria exatamente o que o termo acrescenta.
 *
 * Contrato ONE-WAY, como o arquivo de artigos: sem UUID, hash, version id,
 * lock version ou id de banco. Ausência de dado fica vazia ou `A confirmar`;
 * nada é fabricado.
 */

import { ARQUITETO_CSV_MIME_TYPE, buildCsv, fileNameTimestamp, slugifyForFileName } from "./csv.ts";
import {
  ArquitetoExportError,
  articleExportLabel,
  buildSiloRoleResolver,
  keywordLabel,
  keywordMetric,
  siloLabel,
  type ArquitetoExportInput,
  type KeywordReference,
} from "./export-source.ts";
import { readKgrApplicability, kgrApplicabilityLabel } from "../minerador/kgr-applicability.ts";
import type { ArticleDNA, VersionEnvelope } from "./contracts.ts";

export const EDITORIAL_KEYWORD_DNA_CONTRACT_ID = "EDITORIAL_EXPORT_V1_KEYWORD_DNA";

export const EDITORIAL_KEYWORD_DNA_HEADER = [
  "Silo",
  "Artigo",
  "Papel do artigo",
  "Keyword",
  "Papel da keyword",
  "Intenção principal",
  "Intenção secundária",
  "Funil",
  "Volume",
  "Resultados",
  "KGR",
  "Aplicabilidade KGR",
  "Estado semântico",
  "Confiança do DNA",
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
  "Cobertura/conceitos",
  "Risco de canibalização",
  "Evidências necessárias",
  "Fontes necessárias",
] as const;

/** Falta de dado é declarada, nunca preenchida por analogia. */
export const A_CONFIRMAR = "A confirmar";

const KEYWORD_ROLE_LABELS: Record<KeywordReference["role"], string> = {
  principal: "PRINCIPAL",
  secundaria: "SECUNDÁRIA",
  reforco_narrativo: "REFORÇO",
};

const ARTICLE_ROLE_LABELS: Record<string, string> = { PILAR: "PILAR", SUPORTE: "SUPORTE", SILOPAGE: "SILOPAGE", OUTRO: "" };

const SEARCH_INTENT_LABELS: Record<string, string> = {
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

const OVERLAP_RISK_LABELS: Record<string, string> = { low: "Baixo", medium: "Médio", high: "Alto", unknown: A_CONFIRMAR };
const SEMANTIC_STATE_LABELS: Record<string, string> = { conclusive: "Conclusivo", non_conclusive: "Não conclusivo" };

export type ArquitetoKeywordDnaArtifact = {
  contract: typeof EDITORIAL_KEYWORD_DNA_CONTRACT_ID;
  fileName: string;
  mimeType: string;
  content: string;
  rowCount: number;
  summary: string;
};

function text(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/** A aplicabilidade decidida no Minerador, por keyword, sem recalcular nada. */
function applicabilityOf(reference: KeywordReference): string {
  const snapshot = reference.keywordDnaSnapshot?.sourceKeywordSnapshot as { analise_semantica?: unknown } | undefined;
  const semantic = snapshot?.analise_semantica;
  if (!semantic || typeof semantic !== "object" || Array.isArray(semantic)) return A_CONFIRMAR;
  return kgrApplicabilityLabel(readKgrApplicability(semantic as Record<string, unknown>));
}

export function keywordDnaExportFileName(brandLabel: string | null | undefined, now: Date): string {
  return `arquiteto-keywords-dna-${slugifyForFileName(brandLabel?.trim() || "brand")}-${fileNameTimestamp(now)}.csv`;
}

export function buildArquitetoKeywordDnaExport(input: ArquitetoExportInput): ArquitetoKeywordDnaArtifact {
  if (input.articles.length === 0) {
    throw new ArquitetoExportError("NO_ARTICLES", "Nenhum ArticleDNA canônico carregado para esta Marca.");
  }
  const articlesById = new Map(input.articles.map(version => [version.payload.articleId, version]));
  const siloById = new Map(input.silos.map(silo => [silo.siloDna.payload.siloId, silo]));
  const siloRoleOf = buildSiloRoleResolver(input.silos, articlesById, input.keywordLabelById);

  const rows: unknown[][] = [];
  for (const version of input.articles) {
    const article = version.payload;
    const { siloId, role } = siloRoleOf(article);
    const silo = siloId ? siloById.get(siloId) : undefined;
    const articleLabel = articleExportLabel(version, input.keywordLabelById);

    for (const reference of orderedReferences(article)) {
      // O DNA é o DAQUELA keyword. Sem snapshot, os campos ficam declarados
      // como ausentes em vez de herdarem os da Principal.
      const dna = reference.keywordDnaSnapshot?.payload ?? null;
      const qualification = reference.semanticQualificationRef ?? null;

      rows.push([
        silo ? siloLabel(silo) : "Sem Silo",
        articleLabel,
        ARTICLE_ROLE_LABELS[role] ?? "",
        keywordLabel(reference, input.keywordLabelById),
        KEYWORD_ROLE_LABELS[reference.role],
        text(qualification?.intent)
          || text(reference.originalIntentLabel)
          || (dna ? SEARCH_INTENT_LABELS[dna.searchIntent] ?? dna.searchIntent : A_CONFIRMAR),
        secondaryIntents(reference),
        text(qualification?.funnel) || text(dna?.journeyStage) || A_CONFIRMAR,
        keywordMetric(reference, "volume"),
        keywordMetric(reference, "resultCount"),
        keywordMetric(reference, "kgrScore"),
        applicabilityOf(reference),
        qualification ? SEMANTIC_STATE_LABELS[qualification.semanticState] ?? qualification.semanticState : A_CONFIRMAR,
        typeof dna?.confidence === "number" ? dna.confidence : typeof reference.confidence === "number" ? reference.confidence : "",
        text(dna?.centralEntity) || A_CONFIRMAR,
        dna?.modifiers ?? [],
        text(dna?.audience) || A_CONFIRMAR,
        text(dna?.perceivedProblem) || A_CONFIRMAR,
        text(dna?.desiredResult) || A_CONFIRMAR,
        dna ? EDITORIAL_TYPE_LABELS[dna.likelyEditorialType] ?? dna.likelyEditorialType : A_CONFIRMAR,
        text(dna?.awarenessLevel) || A_CONFIRMAR,
        text(dna?.journeyStage) || A_CONFIRMAR,
        // Promessa e ângulo são do ARTIGO: é a eles que a keyword serve.
        article.promise,
        article.angle,
        reference.requiredTopics.length ? reference.requiredTopics : reference.coveredIntentions,
        OVERLAP_RISK_LABELS[String(reference.overlapRisk ?? "unknown")] ?? A_CONFIRMAR,
        article.evidenceNeeded,
        article.sourcesNeeded,
      ]);
    }
  }

  const semDna = rows.filter(row => row[14] === A_CONFIRMAR).length;
  return {
    contract: EDITORIAL_KEYWORD_DNA_CONTRACT_ID,
    fileName: keywordDnaExportFileName(input.brandLabel, input.now ?? new Date()),
    mimeType: ARQUITETO_CSV_MIME_TYPE,
    content: buildCsv([...EDITORIAL_KEYWORD_DNA_HEADER], rows),
    rowCount: rows.length,
    summary: `Exportado: ${rows.length} keyword(s) de ${input.articles.length} artigo(s)${semDna ? ` · ${semDna} sem KeywordDNA congelado` : ""}.`,
  };
}

/**
 * A ordem da composição canônica: Principal, secundárias, reforços. A leitura
 * do arquivo acompanha a leitura do artigo.
 */
function orderedReferences(article: ArticleDNA): KeywordReference[] {
  const byId = new Map(article.keywordReferences.map(reference => [reference.keywordId, reference]));
  const ordered: KeywordReference[] = [];
  for (const keywordId of [article.principalKeywordId, ...article.secondaryKeywordIds, ...article.narrativeReinforcementIds]) {
    const reference = byId.get(keywordId);
    if (reference && !ordered.includes(reference)) ordered.push(reference);
  }
  // Referência que não aparece nos resumos ainda é membro do artigo.
  for (const reference of article.keywordReferences) if (!ordered.includes(reference)) ordered.push(reference);
  return ordered;
}

/** Intenções que o termo cobre além da principal; nunca inventadas. */
function secondaryIntents(reference: KeywordReference): string[] {
  const principal = text(reference.semanticQualificationRef?.intent) || text(reference.originalIntentLabel);
  return reference.coveredIntentions
    .map(intent => text(intent))
    .filter(intent => intent && intent.toLowerCase() !== principal.toLowerCase());
}

export type { VersionEnvelope };
