/**
 * O ESCOPO DA FASE ARTIGOS É A SELEÇÃO.
 *
 * A tabela é a área de seleção; o painel é a área de trabalho. Os dois botões
 * da fase — processar e concluir — agem sobre o que a pessoa escolheu, e sobre
 * mais nada.
 *
 * O defeito que isto corrige: quando os quatro motores saíram da tela, o
 * caminho selection-scoped que existia ficou órfão e o painel passou a operar
 * sobre o cenário inteiro. A mesa então dizia "1 artigo precisa de decisão
 * humana" apontando para um Article que o humano não tinha selecionado — o
 * gate olhando o lote enquanto a pessoa olhava a seleção.
 *
 * DUAS REGRAS QUE NÃO SE NEGOCIAM:
 *
 *   1. Seleção vazia NÃO significa "todos". Significa que não há escopo, e
 *      então não há o que processar nem o que concluir.
 *   2. Article fora da seleção não participa, não bloqueia e não é alterado.
 *
 * Domínio puro: sem storage, sem React, sem IA.
 */

export type ScopedCandidate = { candidateRef: string };
export type ScopedUniverse<C extends ScopedCandidate> = { candidates: readonly C[] };

/**
 * Recorta os universos de formação pela seleção.
 *
 * Universo que fica sem nenhum candidato selecionado sai inteiro do resultado:
 * mantê-lo vazio faria a portaria contar Silos que não estão em jogo.
 */
export function scopeFormationUniverses<C extends ScopedCandidate, U extends ScopedUniverse<C>>(input: {
  universes: readonly U[];
  selectedCandidateRefs: ReadonlySet<string>;
}): U[] {
  if (!input.selectedCandidateRefs.size) return [];
  return input.universes
    .map(universe => ({
      ...universe,
      candidates: universe.candidates.filter(candidate => input.selectedCandidateRefs.has(candidate.candidateRef)),
    }))
    .filter(universe => universe.candidates.length > 0) as U[];
}

/** Os `candidateRef` das linhas selecionadas na tabela. */
export function selectedCandidateRefsOf(input: {
  selectedArticleIds: ReadonlySet<string>;
  articles: readonly { id: string; candidateRef?: string | null }[];
}): Set<string> {
  return new Set(input.articles
    .filter(article => input.selectedArticleIds.has(article.id))
    .map(article => article.candidateRef)
    .filter((ref): ref is string => Boolean(ref)));
}

export type SelectionScopeVerdict =
  | { ok: true; selectedCount: number }
  | { ok: false; reason: string };

/**
 * O portão de escopo, antes de qualquer trabalho.
 *
 * Existe para que a recusa seja uma frase, e não um botão apagado que a pessoa
 * precisa adivinhar.
 */
export function assertSelectionScope(selectedCandidateRefs: ReadonlySet<string>): SelectionScopeVerdict {
  return selectedCandidateRefs.size
    ? { ok: true, selectedCount: selectedCandidateRefs.size }
    : { ok: false, reason: "Selecione pelo menos um artigo." };
}

/**
 * A ÚNICA AUTORIDADE DE ESCOPO DA FASE ARTIGOS.
 *
 * O rodapé contava linhas selecionadas e as ações contavam `candidateRef`. São
 * conjuntos diferentes: uma linha selecionada que não é candidata do cenário
 * corrente — Article de acervo, keyword sem universo de formação — soma no
 * primeiro e some no segundo. A tela dizia "1 artigo selecionado" e a ação
 * respondia "Selecione pelo menos um artigo", sobre a mesma seleção.
 *
 * Aqui as duas leituras vivem no mesmo objeto, e a recusa NOMEIA quem ficou de
 * fora em vez de mandar selecionar o que já está selecionado.
 */
export type FormationSelectionScope = {
  /** O que a planilha mostra selecionado. */
  selectedCount: number;
  /** O que a fase consegue processar. */
  candidateRefs: Set<string>;
  /** Selecionados que não participam do cenário corrente, com o motivo. */
  excluded: { articleId: string; label: string }[];
  /**
   * Ids selecionados que não existem mais na planilha.
   *
   * A identidade da linha é derivada do `candidateRef`, e o `candidateRef`
   * carrega a Principal do candidato. Quando a formação recompõe o cenário e a
   * Principal muda, o id anterior deixa de existir — e a seleção guardada
   * aponta para uma linha que não está mais lá.
   *
   * Sem nomear este caso, a recusa dizia "nenhum participa da formação" sem
   * dizer por quê, e não havia como distinguir de uma linha sem `candidateRef`.
   */
  missing: string[];
  ok: boolean;
  /** Frase da recusa; `null` quando há escopo. */
  reason: string | null;
};

export function resolveFormationSelectionScope(input: {
  selectedArticleIds: ReadonlySet<string>;
  articles: readonly { id: string; candidateRef?: string | null; keywordPrincipal?: string | null }[];
}): FormationSelectionScope {
  const selecionados = input.articles.filter(article => input.selectedArticleIds.has(article.id));
  const candidateRefs = new Set(selecionados
    .map(article => article.candidateRef)
    .filter((ref): ref is string => Boolean(ref)));
  const excluded = selecionados
    .filter(article => !article.candidateRef)
    .map(article => ({ articleId: article.id, label: String(article.keywordPrincipal || article.id) }));
  const presentes = new Set(input.articles.map(article => article.id));
  const missing = [...input.selectedArticleIds].filter(id => !presentes.has(id));

  const selectedCount = input.selectedArticleIds.size;
  if (!selectedCount) {
    return { selectedCount, candidateRefs, excluded, missing, ok: false, reason: "Selecione pelo menos um artigo." };
  }
  if (!candidateRefs.size && missing.length === selectedCount) {
    /*
     * A seleção inteira aponta para linhas que não existem mais.
     *
     * É o que acontece quando a formação recompõe o cenário e a Principal de
     * um candidato muda: o `candidateRef` muda com ela, e o id guardado fica
     * órfão. Dizer "nenhum participa da formação" aqui mandaria a pessoa
     * investigar o Silo quando o problema é a seleção ter envelhecido.
     */
    return {
      selectedCount, candidateRefs, excluded, missing, ok: false,
      reason: `${missing.length} linha(s) selecionada(s) não existem mais no cenário — a formação foi recomposta. `
        + "Selecione novamente os candidatos que quer processar.",
    };
  }
  if (!candidateRefs.size) {
    /*
     * A pessoa selecionou — o problema é outro, e precisa ser dito.
     *
     * Repetir "selecione pelo menos um artigo" sobre uma seleção existente é a
     * recusa que ninguém consegue resolver: não há ato que a satisfaça.
     */
    const nomes = excluded.map(item => item.label).join(" · ");
    return {
      selectedCount, candidateRefs, excluded, missing, ok: false,
      reason: `${selectedCount} artigo(s) selecionado(s), mas nenhum participa da formação do cenário corrente${nomes ? `: ${nomes}` : ""}. `
        + "Reprocessar artigos recompõe o cenário; se o artigo pertence a outro Silo, feche a fase Silos primeiro.",
    };
  }
  return { selectedCount, candidateRefs, excluded, missing, ok: true, reason: null };
}
