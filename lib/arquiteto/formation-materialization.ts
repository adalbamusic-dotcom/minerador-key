/**
 * DOIS UNIVERSOS NÃO PODEM DIVIDIR A MESMA MESA.
 *
 * A homologação acumulou ArticleDNA gravados sob esquemas de identidade
 * diferentes ao longo do projeto: `group-xxxx`, uuid cru, `article-candidate:
 * <silo>:<principal>` e `article-formation:<uuid>`. Depois que o formador
 * canônico voltou a mandar, os grupos foram refeitos — e alguns desses
 * artefatos antigos passaram a COLIDIR por acaso com os candidatos de agora,
 * porque a identidade derivada `silo + principal` se repete quando a Principal
 * é a mesma.
 *
 * O efeito era a mesa mentir: o cabeçalho contava "5 Article(s) formado(s)"
 * enquanto todas as sete linhas diziam CANDIDATO. Duas leituras da mesma
 * pergunta, com chaves diferentes, e nenhuma das duas errada por si só.
 *
 * A regra aqui é uma só: um ArticleDNA pertence ao cenário corrente quando
 * DESCREVE o cenário corrente — mesmo Silo, mesma Principal, mesmo conjunto
 * de keywords. Coincidir no identificador não basta; um artefato que fala de
 * outra composição é legado, e legado não entra em grid, contagem, mapa,
 * seleção nem formação.
 *
 * Nada é apagado. Isolar não é deletar: o artefato continua no acervo
 * canônico, apenas fora do fluxo novo.
 */

export type MaterializedArticleRecord = {
  articleId: string;
  /** Pai declarado no payload; ausente no legado anterior ao vínculo explícito. */
  territoryRef: string | null;
  principalKeywordId: string;
  keywordIds: readonly string[];
};

export type ScenarioCandidateRecord = {
  candidateRef: string;
  siloRef: string;
  principalKeywordId: string;
  keywordIds: readonly string[];
};

export const LEGACY_REASON_CODES = [
  "NO_MATCHING_CANDIDATE",
  "DIFFERENT_PARENT",
  "DIFFERENT_PRINCIPAL",
  "DIFFERENT_COMPOSITION",
] as const;

export type LegacyReasonCode = (typeof LEGACY_REASON_CODES)[number];

export const LEGACY_REASON_LABELS: Record<LegacyReasonCode, string> = {
  NO_MATCHING_CANDIDATE: "não corresponde a nenhum artigo do cenário corrente",
  DIFFERENT_PARENT: "foi gravado sob outro Silo",
  DIFFERENT_PRINCIPAL: "foi gravado com outra Principal",
  DIFFERENT_COMPOSITION: "descreve outra composição de keywords",
};

export type MaterializationPartition = {
  /** `candidateRef` dos artigos do cenário que JÁ têm ArticleDNA vigente. */
  current: Set<string>;
  /**
   * `candidateRef` → `articleId` do artefato que o descreve.
   *
   * A mesa inteira precisa responder ARTICLE ou CANDIDATO pela MESMA chave. Foi
   * a divergência entre duas chaves — composição no cabeçalho, id da working
   * copy na linha — que fez a mesa contar sete formados enquanto sete linhas
   * diziam CANDIDATO.
   */
  matched: Map<string, string>;
  /** `articleId` de tudo que ficou fora — permanece no acervo, fora do fluxo. */
  legacy: { articleId: string; reason: LegacyReasonCode }[];
};

const sameSet = (left: readonly string[], right: readonly string[]) => {
  if (left.length !== right.length) return false;
  const direita = new Set(right);
  return left.every(item => direita.has(item));
};

/**
 * Separa o que descreve o cenário corrente do que é acervo de homologação.
 *
 * A comparação é por composição, não por identificador: é o único critério que
 * continua verdadeiro depois que a identidade dos candidatos mudou de esquema.
 */
export function partitionMaterializedArticles(input: {
  accepted: readonly MaterializedArticleRecord[];
  candidates: readonly ScenarioCandidateRecord[];
}): MaterializationPartition {
  const matched = new Map<string, string>();
  const legacy: { articleId: string; reason: LegacyReasonCode }[] = [];

  for (const registro of input.accepted) {
    const porPrincipal = input.candidates
      .filter(candidate => candidate.principalKeywordId === registro.principalKeywordId);

    if (!porPrincipal.length) {
      // Sem Principal em comum não há o que reconciliar: o artefato fala de um
      // artigo que o cenário de agora não propõe.
      legacy.push({
        articleId: registro.articleId,
        reason: input.candidates.some(candidate => candidate.candidateRef === registro.articleId)
          ? "DIFFERENT_PRINCIPAL"
          : "NO_MATCHING_CANDIDATE",
      });
      continue;
    }

    const mesmoPai = registro.territoryRef
      ? porPrincipal.filter(candidate => candidate.siloRef === registro.territoryRef)
      : porPrincipal;
    if (!mesmoPai.length) {
      legacy.push({ articleId: registro.articleId, reason: "DIFFERENT_PARENT" });
      continue;
    }

    const equivalente = mesmoPai.find(candidate => sameSet(candidate.keywordIds, registro.keywordIds));
    if (!equivalente) {
      legacy.push({ articleId: registro.articleId, reason: "DIFFERENT_COMPOSITION" });
      continue;
    }

    matched.set(equivalente.candidateRef, registro.articleId);
  }

  return { current: new Set(matched.keys()), matched, legacy };
}

/** Leitura curta para o painel: quantos artefatos ficaram de fora e por quê. */
export function summarizeLegacyArticles(partition: MaterializationPartition) {
  const porMotivo = new Map<LegacyReasonCode, number>();
  for (const item of partition.legacy) {
    porMotivo.set(item.reason, (porMotivo.get(item.reason) || 0) + 1);
  }
  return {
    current: partition.current.size,
    legacy: partition.legacy.length,
    reasons: [...porMotivo.entries()].map(([reason, count]) => ({
      reason,
      count,
      label: LEGACY_REASON_LABELS[reason],
    })),
  };
}
