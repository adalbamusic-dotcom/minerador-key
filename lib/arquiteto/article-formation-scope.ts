import { buildProvisionalGroups } from "./engine.ts";
import type { ArchitectKeyword, ProvisionalArticleGroup } from "./contracts.ts";

/**
 * O SILO É UMA CERCA EM VOLTA DO FORMADOR QUE JÁ EXISTIA.
 *
 * A fase Artigos não precisava de algoritmo novo. `engine.ts` já sabia formar
 * grupos, escolher Principal, classificar secundária e reforço, respeitar o
 * teto e priorizar âncora publicada. O que faltava era só a fronteira:
 *
 *   antes:  buildProvisionalGroups(todasAsKeywordsDaMarca)
 *   agora:  para cada Silo confirmado → buildProvisionalGroups(keywordsDaqueleSilo)
 *
 * O Silo responde "qual universo editorial?"; o engine responde "quais buscas
 * deste universo pertencem à mesma página?". São perguntas diferentes e não
 * devem ser misturadas num único cálculo.
 *
 * IMPORTANTE: o tema do Silo NÃO é descontado antes da comparação. Duas
 * keywords compartilharem o universo é sinal POSITIVO de proximidade — o
 * próprio `compareKeywords` já pesa `silo` a favor. Remover esse tema foi o
 * que transformou 15 keywords em 13 artigos de uma keyword só.
 *
 * Este módulo NÃO reimplementa comparação, principal, papéis nem teto: ele só
 * particiona e delega.
 *
 * Domínio puro: sem storage, sem fetch.
 */

export type SiloScopedGroups = {
  siloRef: string;
  siloLabel: string;
  siloSlug: string | null;
  keywordIds: string[];
  groups: ProvisionalArticleGroup[];
};

export function buildSiloScopedProvisionalGroups(input: {
  silos: readonly { siloRef: string; siloLabel: string; siloSlug: string | null }[];
  /** Keywords já particionadas pela membership canônica. */
  keywordsBySiloRef: ReadonlyMap<string, readonly ArchitectKeyword[]>;
}): SiloScopedGroups[] {
  return input.silos.map(silo => {
    const keywords = input.keywordsBySiloRef.get(silo.siloRef) ?? [];
    return {
      siloRef: silo.siloRef,
      siloLabel: silo.siloLabel,
      siloSlug: silo.siloSlug,
      keywordIds: keywords.map(keyword => String(keyword.id)),
      // A autoridade da composição é o engine canônico, sem alteração interna.
      groups: keywords.length ? buildProvisionalGroups([...keywords]) : [],
    };
  });
}

/**
 * Nenhum grupo pode atravessar Silo.
 *
 * A cerca é estrutural — cada chamada recebe só as keywords de um Silo — mas a
 * verificação existe porque "não pode acontecer" e "não aconteceu" são coisas
 * diferentes, e é barato provar a segunda.
 */
export function countCrossSiloGroups(scoped: readonly SiloScopedGroups[]): number {
  let cruzados = 0;
  for (const escopo of scoped) {
    const doSilo = new Set(escopo.keywordIds);
    for (const group of escopo.groups) {
      if (group.keywords.some(keyword => !doSilo.has(String(keyword.id)))) cruzados += 1;
    }
  }
  return cruzados;
}

/** Síntese do cenário provisório, para o painel dizer o que o engine formou. */
export function summarizeScopedGroups(scoped: readonly SiloScopedGroups[]) {
  const grupos = scoped.flatMap(escopo => escopo.groups);
  const porTamanho = new Map<number, number>();
  for (const group of grupos) {
    porTamanho.set(group.keywords.length, (porTamanho.get(group.keywords.length) ?? 0) + 1);
  }
  return {
    silos: scoped.length,
    keywords: scoped.reduce((total, escopo) => total + escopo.keywordIds.length, 0),
    groups: grupos.length,
    singletons: grupos.filter(group => group.keywords.length === 1).length,
    multiKeyword: grupos.filter(group => group.keywords.length > 1).length,
    sizes: [...porTamanho.entries()].sort((left, right) => left[0] - right[0]),
  };
}
