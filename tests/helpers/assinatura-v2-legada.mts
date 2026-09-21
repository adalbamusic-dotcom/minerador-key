import { canonicalJson } from "../../lib/arquiteto/versioning.ts";
import { readCanonicalKeywordDna } from "../../lib/minerador/logical-read-model.ts";

/**
 * Reproduz o esquema v2 (2026-09-19) para simular no teste o que está
 * gravado no banco hoje. Não é a implementação: é a cópia congelada contra a
 * qual a compatibilidade é verificada.
 */
export function legadoV2(input: { keywordId: string; keyword: string; intent: string | null; volumeSearch: number | null; resultsAllintitle: number | null; kgrScore: number | null; semantic: Record<string, unknown> }): string {
  const semantica = { ...input.semantic };
  delete semantica.aprovacao;
  delete semantica.evidencia_serp;
  const canonical = readCanonicalKeywordDna({ intent: input.intent, analise_semantica: input.semantic });
  const serialized = canonicalJson({
    keywordId: input.keywordId,
    keyword: input.keyword,
    intent: input.intent,
    volumeSearch: input.volumeSearch,
    resultsAllintitle: input.resultsAllintitle,
    kgrScore: input.kgrScore,
    analiseSemantica: semantica,
    canonical: { intent: canonical.intent, funnel: canonical.funnel, niche: canonical.niche },
  });
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-v2:${(hash >>> 0).toString(36)}`;
}
