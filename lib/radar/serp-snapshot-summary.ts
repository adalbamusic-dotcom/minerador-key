import { SerpSnapshotSchema } from "../arquiteto/contracts.ts";
import type { SerpResearchSnapshot } from "./serp/contracts.ts";

/**
 * ===== O RESUMO CANÔNICO DE UM SNAPSHOT DE SERP — 1.1 · §20 e §21 =====
 *
 * ==================== O QUE ESTE MÓDULO EXISTE PARA IMPEDIR ====================
 *
 * `SerpCollectionRecord.snapshot` é um `SerpSnapshot` do Arquiteto: ele exige
 * `schemaVersion`, `keyword`, `location`, `capturedAt`, resultados, intenção
 * dominante, formatos, entidades, perguntas, padrões, lacunas e oportunidades.
 *
 * A rota canônica do Google sempre montou isso com uma função própria. O apoio
 * da Amazon montou à mão — `{ query, resultCount }` — e a gravação passou a
 * estourar DEPOIS da chamada paga:
 *
 *     snapshot.schemaVersion  Invalid input: expected 1
 *     snapshot.keyword        expected string, received undefined
 *     snapshot.location       expected string, received undefined
 *
 * A coleta do Google acontecia, era cobrada, o uso era registrado — e o `parse`
 * seguinte derrubava tudo para o `catch`, que devolvia `FAILED`. O snapshot
 * pago nunca era salvo, e o retry pagava de novo.
 *
 * ==================== POR QUE UM MÓDULO, E NÃO UMA CÓPIA ====================
 *
 * A função existia e estava correta; ela só morava dentro de um `route.ts`,
 * onde ninguém de fora podia alcançá-la. O apoio não tinha como reusar o que
 * não era exportado, e "montar um parecido" foi o caminho que sobrou.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */
export function radarSerpSnapshotSummary(research: SerpResearchSnapshot) {
  return SerpSnapshotSchema.parse({
    schemaVersion: 1,
    keyword: research.query,
    location: research.location,
    capturedAt: research.collectedAt,
    results: research.organicResults.map(result => ({
      position: result.position,
      title: result.title,
      url: result.url,
      pageType: result.inferredType,
      format: result.inferredType,
      entities: research.diagnostic.frequentEntities,
    })),
    dominantIntent: research.diagnostic.dominantIntent || "indeterminada",
    formats: research.diagnostic.dominantFormats,
    entities: research.diagnostic.frequentEntities,
    questions: research.peopleAlsoAsk.map(item => item.question),
    patterns: research.diagnostic.recurringTitlePatterns,
    gaps: research.diagnostic.possibleConflicts,
    opportunities: research.diagnostic.opportunities,
  });
}
