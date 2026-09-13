import type { ArticleDNA } from "./contracts.ts";

/**
 * SUCESSORA SÓ NASCE DE DECISÃO EDITORIAL — não de carimbo.
 *
 * `confirmedArticlePayload` grava data e acrescenta alerta a cada chamada: o
 * `contentHash` SEMPRE muda, e comparar conteúdo bruto responderia "mudou"
 * sobre um no-op. Foi assim que `skin care principia` acumulou de v10 a v16
 * sem nenhuma diferença editorial: seis versões de `confirmedAt` diferente.
 *
 * A comparação aqui é por LISTA DE PERMISSÃO dos fatos que decidem o artigo, e
 * cada um é normalizado antes de comparar — chaves puramente temporais e de
 * autoria são removidas em profundidade. `alerts`, `humanPendingDecisions` e o
 * histórico de política ficam de fora de propósito: são registro do processo,
 * não a decisão.
 *
 * O que NÃO é ignorado: Principal, composição, papéis, Silo, território, slug,
 * classificação, identidade KGR, evidência SERP vinculada e identidade
 * publicada. Qualquer um deles diferente é revisão real, e revisão real vira
 * sucessora aprovada.
 *
 * Domínio puro: sem storage, sem fetch.
 */

/** Os fatos que decidem o artigo. Fora desta lista, nada conta como mudança. */
export const EDITORIAL_DECISION_FIELDS = [
  "principalKeywordId",
  "secondaryKeywordIds",
  "narrativeReinforcementIds",
  "territoryRef",
  "siloId",
  "suggestedSlug",
  "canonical",
  "architectureStatus",
  "primaryKeywordPolicy",
  "classification",
  "unitClassification",
  "unitPurpose",
  "serpAssessmentRef",
  "kgrIdentity",
  "publishedIdentityRef",
] as const;

/**
 * Chaves de carimbo: quem registrou e quando. Elas mudam a cada gravação e não
 * mudam o que o artigo é.
 */
const CARIMBOS = new Set([
  "confirmedAt", "confirmedBy", "decidedAt", "decidedBy", "changedAt", "changedBy",
  "processedAt", "updatedAt", "createdAt", "lastVerifiedAt", "checkedAt",
  "actorId", "actorUserId", "history",
]);

const normalizar = (valor: unknown): unknown => {
  if (Array.isArray(valor)) return valor.map(normalizar);
  if (valor && typeof valor === "object") {
    const entradas = Object.entries(valor as Record<string, unknown>)
      .filter(([chave]) => !CARIMBOS.has(chave))
      .map(([chave, item]) => [chave, normalizar(item)] as const)
      .sort(([esquerda], [direita]) => esquerda.localeCompare(direita));
    return Object.fromEntries(entradas);
  }
  return valor === undefined ? null : valor;
};

/** Papéis por keyword — é a contagem que revela duas Principais. */
const papeis = (article: ArticleDNA) =>
  article.keywordReferences
    .map(referencia => `${referencia.keywordId}:${referencia.role}`)
    .sort()
    .join(",");

export type ArticleEditorialDiff = {
  /** Há decisão editorial diferente entre a canônica e a proposta? */
  substantive: boolean;
  changedFields: string[];
  /** Frase pronta para a mesa quando não há o que consolidar. */
  reason: string;
};

/**
 * A proposta muda alguma decisão em relação à versão aprovada?
 *
 * Sem canônica aprovada não há comparação a fazer: a primeira versão é sempre
 * substantiva, porque é ela que passa a existir.
 */
export function articleEditorialDiff(input: {
  canonical: ArticleDNA | null | undefined;
  candidate: ArticleDNA;
}): ArticleEditorialDiff {
  if (!input.canonical) {
    return { substantive: true, changedFields: ["(sem versão aprovada anterior)"], reason: "Primeira versão aprovada deste artigo." };
  }

  const changedFields: string[] = [];
  for (const campo of EDITORIAL_DECISION_FIELDS) {
    const antes = JSON.stringify(normalizar((input.canonical as Record<string, unknown>)[campo]));
    const depois = JSON.stringify(normalizar((input.candidate as Record<string, unknown>)[campo]));
    if (antes !== depois) changedFields.push(campo);
  }
  if (papeis(input.canonical) !== papeis(input.candidate)) changedFields.push("keywordReferences.role");

  if (!changedFields.length) {
    return {
      substantive: false,
      changedFields: [],
      reason: "O ArticleDNA aprovado já representa esta formação. Nenhuma nova versão foi necessária.",
    };
  }
  return {
    substantive: true,
    changedFields,
    reason: `Revisão real: ${changedFields.join(", ")}.`,
  };
}
