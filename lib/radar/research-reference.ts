/**
 * A IDENTIDADE DA PESQUISA PROFUNDA — QUE NÃO É POSIÇÃO.
 *
 * A curadoria canônica identifica um resultado pela POSIÇÃO dentro do snapshot
 * do artigo: `organic:2`. Isso funciona perfeitamente para uma SERP — e quebra
 * para várias. A auditoria R10.2C provou a colisão com todas as letras:
 *
 *   Principal, posição 2 → B
 *   Auxiliar,  posição 2 → D
 *   ambas seriam `organic:2`
 *
 * Então a pesquisa profunda ganha o SEU espaço de identidade, derivado da URL
 * normalizada. A identidade canônica continua existindo, intocada, no lugar dela.
 *
 * DUAS REGRAS QUE SUSTENTAM TUDO:
 *
 *   1. A mesma URL em três consultas é UMA referência com três aparições.
 *   2. URLs diferentes no mesmo domínio são referências diferentes — a página é
 *      a unidade de observação, não o site.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import type { RadarArticleResearchContext } from "./article-research-context.ts";
import type { RadarCompetitorClass, RadarCompetitorUniverse, RadarExecutedQuery } from "./competitor-universe.ts";
import type { RadarEntityReading } from "./semantic-concept-model.ts";

/**
 * A normalização canônica de URL do projeto.
 *
 * Mesma regra que o Arquiteto usa para comparar SERPs em
 * `candidate-serp-boundary.ts`: protocolo, `www.`, query, fragmento e barra
 * final não distinguem página. O CAMINHO distingue — `/artigo-a` e `/artigo-b`
 * continuam duas referências.
 */
export function radarNormalizedUrl(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

/**
 * Identidade estável, determinística e curta.
 *
 * FNV-1a sobre a URL normalizada. Sem crypto assíncrono: esta função é chamada
 * dentro de projeções puras, e o mesmo texto precisa devolver o mesmo id em
 * qualquer runtime — no servidor, no navegador e no teste.
 */
export function radarResearchReferenceId(normalizedUrl: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalizedUrl.length; index += 1) {
    hash ^= normalizedUrl.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  /* Segundo passe com semente diferente: 64 bits de espaço, não 32. */
  let second = 0x9e3779b1;
  for (let index = normalizedUrl.length - 1; index >= 0; index -= 1) {
    second ^= normalizedUrl.charCodeAt(index);
    second = Math.imul(second, 0x85ebca6b) >>> 0;
  }
  return `research:${hash.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

export type RadarReferenceSourceType = "canonical" | "auxiliary" | "formation";

export type RadarReferenceAppearance = {
  /** A execução de consulta onde a URL foi observada. */
  queryExecutionId: string;
  keywordId: string | null;
  keyword: string | null;
  keywordRole: RadarExecutedQuery["role"];
  sourceType: RadarReferenceSourceType;
  rank: number;
  resultType: string | null;
};

export type RadarResearchReference = {
  referenceId: string;
  normalizedUrl: string;
  /** A URL como o provider devolveu, na primeira observação. */
  url: string;
  domain: string;
  title: string;
  appearances: RadarReferenceAppearance[];
  queryCount: number;
  principalRank: number | null;
  secondaryRanks: number[];
  reinforcementRanks: number[];
  classification: RadarCompetitorClass;
  classificationReason: string;
  intentCompatibility: "compatible" | "divergent" | "unknown";
  entityCompatibility: RadarEntityReading;
  siloCompatibility: "own_domain" | "external" | "unknown";
  formationSerpSeen: boolean;
  formationContext: { verdict: string | null; humanDecision: string | null } | null;
};

const classeDaConsulta = (query: RadarExecutedQuery): RadarReferenceSourceType =>
  query.serpClass || (query.role === "principal" ? "canonical" : "auxiliary");

/**
 * O universo, endereçável.
 *
 * As referências são as MESMAS URLs que o universo classificou — a diferença é
 * que agora cada uma tem nome próprio e a lista de onde apareceu.
 */
export function buildRadarResearchReferences(input: {
  queries: readonly RadarExecutedQuery[];
  universe: RadarCompetitorUniverse;
  context?: RadarArticleResearchContext;
}): RadarResearchReference[] {
  const porUrl = new Map<string, RadarReferenceAppearance[]>();

  for (const query of input.queries) {
    const sourceType = classeDaConsulta(query);
    for (const resultado of query.results) {
      const chave = radarNormalizedUrl(resultado.url);
      if (!chave) continue;
      const lista = porUrl.get(chave) || [];
      lista.push({
        queryExecutionId: query.queryId,
        keywordId: query.keywordId || null,
        keyword: query.keyword || null,
        keywordRole: query.role,
        sourceType,
        rank: resultado.position,
        resultType: resultado.inferredType || null,
      });
      porUrl.set(chave, lista);
    }
  }

  return input.universe.candidates.map(candidato => {
    const normalizedUrl = radarNormalizedUrl(candidato.url);
    const appearances = (porUrl.get(normalizedUrl) || []).sort((left, right) => left.rank - right.rank);
    return {
      referenceId: radarResearchReferenceId(normalizedUrl),
      normalizedUrl,
      url: candidato.url,
      domain: candidato.domain,
      title: candidato.title,
      appearances,
      /* Consultas distintas, não aparições: a mesma URL duas vezes na mesma SERP conta uma. */
      queryCount: new Set(appearances.map(item => item.queryExecutionId)).size || candidato.queryCount,
      principalRank: candidato.principalRank,
      secondaryRanks: [...candidato.secondaryRanks],
      reinforcementRanks: [...candidato.reinforcementRanks],
      classification: candidato.classification,
      classificationReason: candidato.candidateReason,
      intentCompatibility: candidato.intentCompatibility,
      entityCompatibility: candidato.entityCompatibility,
      siloCompatibility: candidato.siloCompatibility,
      formationSerpSeen: candidato.formationSerpSeen,
      formationContext: candidato.formationSerpVerdict || candidato.humanFormationDecision
        ? { verdict: candidato.formationSerpVerdict, humanDecision: candidato.humanFormationDecision }
        : null,
    };
  });
}

/** De onde esta referência veio, em uma palavra — para a tela e para o relatório. */
export function radarReferenceOrigin(reference: Pick<RadarResearchReference, "appearances" | "formationSerpSeen">): "CANONICAL" | "AUXILIARY" | "CANONICAL_AND_AUXILIARY" | "FORMATION" | "UNKNOWN" {
  const tipos = new Set(reference.appearances.map(item => item.sourceType));
  const canonica = tipos.has("canonical");
  const auxiliar = tipos.has("auxiliary");
  if (canonica && auxiliar) return "CANONICAL_AND_AUXILIARY";
  if (canonica) return "CANONICAL";
  if (auxiliar) return "AUXILIARY";
  if (reference.formationSerpSeen || tipos.has("formation")) return "FORMATION";
  return "UNKNOWN";
}

export const radarReferenceOriginLabel = (origin: ReturnType<typeof radarReferenceOrigin>) => ({
  CANONICAL: "Canônica",
  AUXILIARY: "Auxiliar",
  CANONICAL_AND_AUXILIARY: "Canônica + auxiliar",
  FORMATION: "Formação",
  UNKNOWN: "Origem não observada",
}[origin]);

/**
 * A frase da recorrência: onde a referência apareceu, legível.
 *
 * "Encontrada em 3 consultas: Principal #4 · Secundária #2 · Reforço #7"
 */
export function radarReferenceAppearanceSummary(reference: Pick<RadarResearchReference, "appearances" | "queryCount">): string {
  if (!reference.appearances.length) return "Sem aparição observada nesta investigação.";
  const rotuloDoPapel = { principal: "Principal", secundaria: "Secundária", reforco_narrativo: "Reforço" };
  const partes = reference.appearances.map(item => `${rotuloDoPapel[item.keywordRole]}${item.keyword ? ` "${item.keyword}"` : ""} #${item.rank}`);
  return `Encontrada em ${reference.queryCount} consulta(s): ${partes.join(" · ")}`;
}
