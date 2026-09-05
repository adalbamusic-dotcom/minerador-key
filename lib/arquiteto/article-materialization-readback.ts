/**
 * GRAVAR NÃO É SUCESSO. SUCESSO É O REMOTO DEVOLVER O QUE FOI GRAVADO.
 *
 * A conclusão da formação é o ponto em que um cenário revisado por uma pessoa
 * vira artefato canônico. Anunciar "formação concluída" porque o POST não
 * lançou exceção é a pior mentira possível nesse ponto: a mesa passa a exibir
 * Article formado, o F5 reconstrói a partir do remoto, e a composição que
 * aparece pode não ser a que foi aprovada.
 *
 * Por isso a comparação é campo a campo, e é a COMPOSIÇÃO que manda — pai,
 * Principal, secundárias, reforços e endereço. Um `versionNumber` igual com
 * secundária virada reforço não é sucesso parcial: é outro artigo.
 *
 * Domínio puro: sem storage, sem fetch. Quem lê o remoto é o chamador.
 */

export type MaterializedArticleExpectation = {
  articleId: string;
  /** Pai estrutural declarado; o novo ArticleDNA não infere o Silo. */
  territoryRef: string | null;
  principalKeywordId: string;
  secondaryKeywordIds: readonly string[];
  narrativeReinforcementIds: readonly string[];
  slug: string | null;
  versionNumber: number;
  contentHash: string;
};

export type MaterializedArticleObserved = MaterializedArticleExpectation | null;

export const READBACK_FIELDS = [
  "articleId",
  "territoryRef",
  "principalKeywordId",
  "secondaryKeywordIds",
  "narrativeReinforcementIds",
  "slug",
  "versionNumber",
  "contentHash",
] as const;

export type ReadbackField = (typeof READBACK_FIELDS)[number];

export type ReadbackMismatch = {
  field: ReadbackField | "presence";
  expected: string;
  observed: string;
};

export type ArticleReadbackResult = {
  articleId: string;
  ok: boolean;
  mismatches: ReadbackMismatch[];
};

const lista = (value: readonly string[]) => [...value].sort().join(", ") || "—";
const texto = (value: string | number | null) => (value === null || value === "" ? "—" : String(value));

/**
 * O remoto confirma este artigo?
 *
 * Conjuntos são comparados como conjuntos: a ordem em que as secundárias
 * chegam não é decisão editorial e não pode reprovar uma escrita correta.
 */
export function compareMaterializedArticle(
  expected: MaterializedArticleExpectation,
  observed: MaterializedArticleObserved,
): ArticleReadbackResult {
  if (!observed) {
    return {
      articleId: expected.articleId,
      ok: false,
      mismatches: [{ field: "presence", expected: "ArticleDNA no remoto", observed: "ausente" }],
    };
  }

  const mismatches: ReadbackMismatch[] = [];
  const compare = (field: ReadbackField, esperado: string, lido: string) => {
    if (esperado !== lido) mismatches.push({ field, expected: esperado, observed: lido });
  };

  compare("articleId", expected.articleId, observed.articleId);
  compare("territoryRef", texto(expected.territoryRef), texto(observed.territoryRef));
  compare("principalKeywordId", expected.principalKeywordId, observed.principalKeywordId);
  compare("secondaryKeywordIds", lista(expected.secondaryKeywordIds), lista(observed.secondaryKeywordIds));
  compare("narrativeReinforcementIds", lista(expected.narrativeReinforcementIds), lista(observed.narrativeReinforcementIds));
  compare("slug", texto(expected.slug), texto(observed.slug));
  compare("versionNumber", String(expected.versionNumber), String(observed.versionNumber));
  compare("contentHash", expected.contentHash, observed.contentHash);

  return { articleId: expected.articleId, ok: mismatches.length === 0, mismatches };
}

export type MaterializationReadback = {
  ok: boolean;
  confirmed: ArticleReadbackResult[];
  rejected: ArticleReadbackResult[];
  /** Frase única para a notificação; nomeia o campo, não só o fracasso. */
  summary: string;
};

/**
 * O veredito do lote inteiro.
 *
 * Um artigo divergente não invalida os que o remoto confirmou — mas também não
 * some do relatório. Contar "7 criados" quando o remoto confirmou 6 é o tipo de
 * sucesso falso que este módulo existe para impedir.
 */
export function readbackMaterializedArticles(input: {
  expectations: readonly MaterializedArticleExpectation[];
  observedByArticleId: ReadonlyMap<string, MaterializedArticleObserved>;
}): MaterializationReadback {
  const resultados = input.expectations.map(expectation =>
    compareMaterializedArticle(expectation, input.observedByArticleId.get(expectation.articleId) ?? null));

  const confirmed = resultados.filter(item => item.ok);
  const rejected = resultados.filter(item => !item.ok);

  const camposDivergentes = [...new Set(rejected.flatMap(item => item.mismatches.map(mismatch => mismatch.field)))];
  const summary = rejected.length === 0
    ? `${confirmed.length} artigo(s) confirmados pelo remoto.`
    : `${confirmed.length} de ${resultados.length} artigo(s) confirmados; ${rejected.length} divergem no remoto em ${camposDivergentes.join(", ")}.`;

  return { ok: rejected.length === 0 && resultados.length > 0, confirmed, rejected, summary };
}

/** Leitura de um ArticleDNA remoto no formato que a comparação espera. */
export function observedFromArticleDna(version: {
  versionNumber: number;
  contentHash: string;
  payload: {
    articleId: string;
    territoryRef?: string | null;
    principalKeywordId: string;
    secondaryKeywordIds?: readonly string[];
    narrativeReinforcementIds?: readonly string[];
    suggestedSlug?: string | null;
  };
}): MaterializedArticleExpectation {
  return {
    articleId: String(version.payload.articleId),
    territoryRef: version.payload.territoryRef ? String(version.payload.territoryRef) : null,
    principalKeywordId: String(version.payload.principalKeywordId),
    secondaryKeywordIds: (version.payload.secondaryKeywordIds || []).map(String),
    narrativeReinforcementIds: (version.payload.narrativeReinforcementIds || []).map(String),
    slug: version.payload.suggestedSlug ?? null,
    versionNumber: version.versionNumber,
    contentHash: version.contentHash,
  };
}
