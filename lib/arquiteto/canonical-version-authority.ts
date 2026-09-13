/**
 * ARTEFATO CANÔNICO APROVADO ≠ PROPOSTA EM EDIÇÃO.
 *
 * O acervo guarda TODAS as versões de cada entidade. A leitura da mesa colapsa
 * essa lista num registro por entidade com `Object.fromEntries`, e como o
 * remoto devolve em ordem crescente de `version_number`, quem sobra é a versão
 * mais NOVA — aprovada ou não. Foi assim que um ArticleDNA v13 aprovado passou
 * a aparecer como "Aguardando aprovação" no instante em que alguém registrou
 * uma classificação e nasceu um v14 `proposed`.
 *
 * Uma proposta não remove a autoridade da versão aprovada. São dois fatos:
 *
 *   canonical        a versão que RESPONDE pelo artefato — a última aprovada
 *   workingProposal  a revisão em andamento sobre ela, quando existe
 *
 * E `workingProposal` existir NÃO torna `canonical` inválida. Invalidar exige
 * sinal explícito: território que mudou, composição aprovada desfeita, Silo
 * trocado, dependência de versão que não casa mais, SERP obrigatória da nova
 * formação desatualizada. "Existe versão mais nova" não é nenhuma dessas
 * coisas — é só trabalho em curso.
 *
 * Domínio puro: sem storage, sem fetch.
 */

/** Status que tiram a versão da disputa: ela não responde por nada. */
const DESCARTADOS = new Set(["rejected", "superseded"]);

export type VersionLike = { versionId: string; versionNumber: number };

export type VersionAuthority<T extends VersionLike> = {
  /** A versão que responde pelo artefato hoje: a última aprovada. */
  canonical: T | null;
  /** A revisão em andamento sobre a canônica, quando existe. */
  workingProposal: T | null;
  /** A última versão gravada, qualquer status — base de qualquer sucessora. */
  latest: T | null;
};

/**
 * Quem responde por esta entidade, e o que está em edição sobre ela.
 *
 * `latest` continua sendo a base para criar sucessora: numerar a partir da
 * canônica quando existe proposta mais nova produziria colisão de versão.
 */
export function resolveVersionAuthority<T extends VersionLike>(input: {
  versions: readonly T[];
  statusOf: (versionId: string) => string | null;
}): VersionAuthority<T> {
  const vivas = input.versions
    .filter(version => !DESCARTADOS.has(String(input.statusOf(version.versionId) ?? "")))
    .slice()
    .sort((left, right) => left.versionNumber - right.versionNumber);

  const latest = vivas.at(-1) ?? null;
  const canonical = vivas.filter(version => input.statusOf(version.versionId) === "approved").at(-1) ?? null;

  /*
   * Proposta é o que está ACIMA da canônica.
   *
   * Uma versão não aprovada mais ANTIGA que a canônica não é revisão em
   * andamento: é história que a aprovação já superou.
   */
  const workingProposal = latest && latest.versionId !== canonical?.versionId
    && (!canonical || latest.versionNumber > canonical.versionNumber)
    ? latest
    : null;

  return { canonical, workingProposal, latest };
}

/** Agrupa por entidade: uma autoridade por artefato. */
export function groupVersionAuthorities<T extends VersionLike>(input: {
  versions: readonly T[];
  entityIdOf: (version: T) => string;
  statusOf: (versionId: string) => string | null;
}): Map<string, VersionAuthority<T>> {
  const porEntidade = new Map<string, T[]>();
  for (const version of input.versions) {
    const entityId = input.entityIdOf(version);
    const lista = porEntidade.get(entityId);
    if (lista) lista.push(version);
    else porEntidade.set(entityId, [version]);
  }
  const autoridades = new Map<string, VersionAuthority<T>>();
  for (const [entityId, versions] of porEntidade) {
    autoridades.set(entityId, resolveVersionAuthority({ versions, statusOf: input.statusOf }));
  }
  return autoridades;
}

export type CanonicalRevisionState<T extends VersionLike> = VersionAuthority<T> & {
  /** Existe revisão em andamento? Fato de trabalho, não de validade. */
  workingProposalExists: boolean;
  /**
   * A versão aprovada foi ESTRUTURALMENTE invalidada?
   *
   * Só com motivo declarado. Nunca inferido da existência de proposta.
   */
  canonicalIsStale: boolean;
  staleReasons: readonly string[];
  /** Pode ser usada por consumidores a jusante (Links, Radar)? */
  usableDownstream: boolean;
  /** Frase da mesa: separa "aprovado" de "revisão em andamento". */
  headline: string;
};

/**
 * O estado de revisão de um artefato, com as duas perguntas separadas.
 *
 * `staleReasons` vem de quem sabe medir invalidação — o gate SERP, o impacto
 * territorial, a defasagem do grafo. Este módulo não adivinha nenhuma delas.
 */
export function canonicalRevisionState<T extends VersionLike>(input: {
  authority: VersionAuthority<T>;
  /** Motivos EXPLÍCITOS de invalidação estrutural da versão aprovada. */
  staleReasons?: readonly string[];
  /** Rótulo do artefato para a frase; opcional. */
  label?: string;
}): CanonicalRevisionState<T> {
  const { canonical, workingProposal, latest } = input.authority;
  const staleReasons = canonical ? (input.staleReasons ?? []) : [];
  const canonicalIsStale = staleReasons.length > 0;

  const versao = (version: T | null) => (version ? `v${version.versionNumber}` : null);
  const headline = !canonical
    ? workingProposal
      ? `Sem versão aprovada · ${versao(workingProposal)} em revisão`
      : "Sem versão aprovada"
    : canonicalIsStale
      ? `${versao(canonical)} aprovada, mas precisa de revisão: ${staleReasons.join(" ")}`
      : workingProposal
        ? `${versao(canonical)} aprovada · revisão ${versao(workingProposal)} em andamento`
        : `${versao(canonical)} aprovada`;

  return {
    canonical, workingProposal, latest,
    workingProposalExists: Boolean(workingProposal),
    canonicalIsStale,
    staleReasons,
    // Proposta em andamento NÃO barra o consumo da aprovada; invalidação barra.
    usableDownstream: Boolean(canonical) && !canonicalIsStale,
    headline: input.label ? `${input.label} · ${headline}` : headline,
  };
}
