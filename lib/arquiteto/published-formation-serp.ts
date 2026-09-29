/**
 * O PARECER DE SERP DO ARTIGO PUBLICADO DEPOIS DO "REFORÇAR PUBLICADOS"
 * (correção de 2026-09-28, Defeito 3).
 *
 * O Reforçar grava a composição do publicado como formação humana
 * (`articleFormationRef = article-formation:<uuid>`). A partir daí a mesa
 * enxerga o artigo como o candidato HUMANO daquela formação — mas o parecer
 * de SERP que o "Processar artigos" gravou para a página está na chave do
 * candidato CALCULADO (`article-candidate:<Silo>:<página>`). A mesa procurava
 * só pela chave do candidato, não achava nada e dizia "0 de 21 confrontados",
 * "SERP de formação: não executada" — de artigos que foram ao mercado.
 *
 * O que este módulo faz, sem burlar o gate:
 *
 *   1. `aliasPublishedFormationSerp` — para a formação humana que contém UMA
 *      página publicada e ainda não tem parecer próprio, oferece o parecer da
 *      página sob a chave da formação. Quem decide se ele vale é o hash da
 *      base (`formationBaseHash`), exatamente como antes: composição igual →
 *      vigente; composição mudou → desatualizado ("a composição mudou"), e o
 *      caminho é o "Processar artigos" (cache primeiro).
 *   2. `serpAssessmentComposition` / `serpCompositionDescribes` — a composição
 *      que um parecer observou (keywords e principal), para o servidor do
 *      Reforçar exigir o parecer DA COMPOSIÇÃO que vai gravar.
 *
 * Domínio puro: sem banco, sem rede.
 */


const texto = (valor: unknown) => typeof valor === "string" && valor.trim() ? valor.trim() : null;

export type SerpArticleRole = "principal" | "secundaria" | "reforco_narrativo";

export type SerpAssessmentComposition = {
  keywordIds: string[];
  principalKeywordId: string | null;
  /**
   * Aditivo (corretor 2026-09-28): o papel de cada keyword CONSULTADA quando o
   * parecer foi feito (`recommendations[].currentRole`). A mesa confere os
   * papéis pelo hash da base; o servidor do Reforçar confere por aqui.
   */
  roles?: Record<string, SerpArticleRole>;
  /** `false` = o marcador das 4 lentes diz que faltam lentes; ausente = parecer legado (desconhecido). */
  lensesComplete?: boolean;
  /** O parecer foi marcado como desatualizado (`evaluationStatus = outdated`). */
  outdated?: boolean;
};

/** O marcador das lentes: as 4 pedidas, todas observadas, nenhuma faltando. Ausente = desconhecido. */
function lentesCompletas(marker: unknown): boolean | undefined {
  if (!marker || typeof marker !== "object") return undefined;
  const registro = marker as { requested?: unknown; observed?: unknown; missing?: unknown };
  const pedidas = Array.isArray(registro.requested) ? registro.requested.map(String) : null;
  const vistas = Array.isArray(registro.observed) ? registro.observed.map(String) : null;
  const faltam = Array.isArray(registro.missing) ? registro.missing : null;
  if (!pedidas || !vistas || !faltam) return undefined;
  return pedidas.length === 4 && faltam.length === 0 && pedidas.every(lente => vistas.includes(lente));
}

/**
 * A composição que o parecer observou: as keywords avaliadas, a principal e o
 * papel de cada consultada, se as 4 lentes vieram e se ele ainda vale.
 * `lensesMarker` é `interpretation.lenses` do registro do parecer.
 */
export function serpAssessmentComposition(assessment: unknown, lensesMarker?: unknown): SerpAssessmentComposition | null {
  if (!assessment || typeof assessment !== "object") return null;
  const registro = assessment as { recommendations?: unknown; keywordDnaReferences?: unknown; evaluationStatus?: unknown };
  const lerLista = (valor: unknown) => Array.isArray(valor)
    ? valor.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && typeof (item as { keywordId?: unknown }).keywordId === "string")
    : [];
  const recomendacoes = lerLista(registro.recommendations).map(item => ({ keywordId: String(item.keywordId), currentRole: String(item.currentRole ?? "") }));
  const ids = [...new Set([
    ...recomendacoes.map(item => item.keywordId),
    ...lerLista(registro.keywordDnaReferences).map(item => String(item.keywordId)),
  ])];
  if (!ids.length) return null;
  const principal = recomendacoes.find(item => item.currentRole === "principal")?.keywordId ?? null;
  const roles: Record<string, SerpArticleRole> = {};
  for (const item of recomendacoes) {
    if (item.currentRole === "principal" || item.currentRole === "secundaria" || item.currentRole === "reforco_narrativo") roles[item.keywordId] = item.currentRole;
  }
  const lentes = lentesCompletas(lensesMarker);
  return {
    keywordIds: ids,
    principalKeywordId: principal ? String(principal) : null,
    roles,
    ...(lentes === undefined ? {} : { lensesComplete: lentes }),
    ...(registro.evaluationStatus === "outdated" ? { outdated: true } : {}),
  };
}

export type SerpCompositionTarget = {
  keywordIds: readonly string[];
  principalKeywordId: string;
  /** O papel de cada keyword na composição a gravar (conferido nas que o parecer consultou). */
  roles?: Readonly<Record<string, SerpArticleRole>>;
};

/**
 * Por que este parecer NÃO responde por esta composição, em português — ou
 * `null` quando responde: mesmas keywords, mesma principal, mesmos papéis nas
 * consultadas, as 4 lentes (quando o marcador existe) e parecer vigente.
 *
 * O servidor não recalcula o hash da base da mesa (intenção e contexto do
 * Silo moram na tela); a mesa continua conferindo o hash e diz "desatualizado"
 * quando ele muda.
 */
export function serpCompositionMismatch(observed: SerpAssessmentComposition | null | undefined, target: SerpCompositionTarget): string | null {
  if (!observed) return "sem parecer da SERP";
  if (observed.outdated) return "o parecer da SERP foi marcado como desatualizado";
  if (observed.lensesComplete === false) return "o parecer da SERP ficou sem alguma das 4 lentes";
  const alvo = new Set(target.keywordIds);
  const visto = new Set(observed.keywordIds);
  if (alvo.size !== visto.size || [...alvo].some(id => !visto.has(id))) {
    return `o parecer da SERP descreve outra composição (${visto.size === 1 ? "1 keyword" : `${visto.size} keywords`}; a composição a gravar tem ${alvo.size})`;
  }
  if (!observed.principalKeywordId) return "o parecer da SERP não diz qual era a principal (ela não foi consultada)";
  if (observed.principalKeywordId !== target.principalKeywordId) return "o parecer da SERP foi feito com outra principal";
  for (const [keywordId, papel] of Object.entries(observed.roles || {})) {
    const esperado = target.roles?.[keywordId];
    if (esperado && esperado !== papel) return "o parecer da SERP foi feito com outros papéis (secundária × reforço)";
  }
  return null;
}

/** O parecer descreve EXATAMENTE esta composição? (`serpCompositionMismatch` sem motivo) */
export function serpCompositionDescribes(
  observed: SerpAssessmentComposition | null | undefined,
  target: SerpCompositionTarget,
): boolean {
  return serpCompositionMismatch(observed, target) === null;
}

/* ------------------------- a troca gravada na mesa ------------------------- */

/**
 * O motivo que o "Reforçar publicados" grava na decisão humana da mesa quando
 * a troca da principal é confirmada. É o marcador que distingue ESTA decisão
 * (a troca vista na prévia e confirmada por humano) de uma formação qualquer
 * da Revisão humana: só ela vira troca na confirmação seguinte, e só ela faz
 * a mesa aceitar a página como secundária antes do ArticleDNA ser gravado.
 */
export const PUBLISHED_REINFORCEMENT_SWAP_REASON = "Reforçar publicados: troca da principal confirmada por humano; a página publicada fica como secundária (URL, slug e canonical preservados).";

type SwapRowLike = {
  id?: unknown;
  keywordId?: unknown;
  isPublished?: unknown;
  articleFormationRef?: unknown;
  articleFormationDecision?: unknown;
};

/** A decisão humana da mesa é a da troca do Reforçar? Devolve o papel gravado. */
export function publishedSwapDecisionRole(decision: unknown): string | null {
  const registro = decision && typeof decision === "object" ? decision as { role?: unknown; reason?: unknown; source?: unknown } : null;
  return registro && registro.source === "human" && registro.reason === PUBLISHED_REINFORCEMENT_SWAP_REASON && typeof registro.role === "string"
    ? registro.role
    : null;
}

/**
 * As trocas da principal confirmadas no Reforçar e gravadas na mesa: por
 * página publicada, a nova principal. Vale quando a formação tem UMA página
 * publicada marcada "secundaria" e UMA keyword marcada "principal", as duas
 * com o marcador da troca. Nada é gravado: é leitura.
 */
export function recordedPublishedSwapsOf(rows: readonly SwapRowLike[]): Map<string, string> {
  const formacoes = new Map<string, SwapRowLike[]>();
  for (const row of rows) {
    const ref = texto(row.articleFormationRef);
    if (ref) formacoes.set(ref, [...(formacoes.get(ref) || []), row]);
  }
  const trocas = new Map<string, string>();
  for (const membros of formacoes.values()) {
    const paginas = membros.filter(row => row.isPublished === true);
    if (paginas.length !== 1 || publishedSwapDecisionRole(paginas[0].articleFormationDecision) !== "secundaria") continue;
    const novas = membros.filter(row => row.isPublished !== true && publishedSwapDecisionRole(row.articleFormationDecision) === "principal");
    if (novas.length !== 1) continue;
    const pagina = texto(paginas[0].keywordId) ?? texto(paginas[0].id);
    const nova = texto(novas[0].keywordId) ?? texto(novas[0].id);
    if (pagina && nova) trocas.set(pagina, nova);
  }
  return trocas;
}

/** A chave do candidato calculado de uma página num Silo (a mesma da formação). */
export const calculatedCandidateRefOf = (territoryRef: string, keywordId: string) => `article-candidate:${territoryRef}:${keywordId}`;

type WorkspaceRowLike = {
  id?: unknown;
  keywordId?: unknown;
  isPublished?: unknown;
  territoryRef?: unknown;
  articleFormationRef?: unknown;
};

/**
 * Os pareceres da mesa, mais o da página publicada sob a chave da formação
 * humana dela quando essa formação ainda não tem parecer próprio.
 *
 * Só vale para formação com EXATAMENTE uma página publicada (duas publicadas
 * no mesmo grupo já é conflito dito em outro lugar) e com parecer gravado na
 * chave calculada da página no MESMO Silo. Nada é gravado: é leitura.
 */
export function aliasPublishedFormationSerp<T extends { candidateRef: string }>(
  entries: readonly T[],
  rows: readonly WorkspaceRowLike[],
): T[] {
  const porRef = new Map(entries.map(entry => [entry.candidateRef, entry]));
  const formacoes = new Map<string, WorkspaceRowLike[]>();
  for (const row of rows) {
    const ref = texto(row.articleFormationRef);
    if (!ref) continue;
    formacoes.set(ref, [...(formacoes.get(ref) || []), row]);
  }
  const extras: T[] = [];
  for (const [ref, membros] of formacoes) {
    if (porRef.has(ref)) continue;
    const publicadas = membros.filter(row => row.isPublished === true);
    if (publicadas.length !== 1) continue;
    const pagina = publicadas[0];
    const id = texto(pagina.keywordId) ?? texto(pagina.id);
    const territorio = texto(pagina.territoryRef);
    if (!id || !territorio) continue;
    const daPagina = porRef.get(calculatedCandidateRefOf(territorio, id));
    if (!daPagina) continue;
    extras.push({ ...daPagina, candidateRef: ref });
  }
  return extras.length ? [...entries, ...extras] : [...entries];
}
