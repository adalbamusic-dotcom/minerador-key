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
