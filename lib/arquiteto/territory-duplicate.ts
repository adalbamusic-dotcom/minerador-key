/**
 * DUPLICATA DE TERRITÓRIO — POR IDENTIDADE ESTRUTURAL, NUNCA POR NOME.
 *
 * Dois territórios "Anti-idade e Retinol" nasceram da MESMA entrada do
 * catálogo do site, com 47 segundos de diferença. Um foi consolidado, ganhou
 * SiloDNA, SiloPage, entidade central, fronteira e narrativa. O outro ficou
 * candidato, com todos os campos editoriais vazios — e mesmo assim competia
 * de igual para igual por score, e chegou a levar uma busca de um ArticleDNA
 * aprovado.
 *
 * A regra aqui NÃO é semântica. Nome parecido não é duplicata: dois Silos
 * podem legitimamente se chamar de forma próxima e cobrir coisas diferentes.
 * O que caracteriza duplicata é apontar para a MESMA raiz publicada — mesma
 * entrada de catálogo, mesma URL normalizada. Isso é fato estrutural, não
 * julgamento.
 *
 * Domínio puro: sem storage, sem fetch, sem IA.
 */

export type TerritoryIdentity = {
  territoryRef: string;
  name: string | null;
  lifecycleStatus: string;
  publishedStructureRef: { catalogEntryId?: string | null; normalizedUrl?: string | null } | null;
  /** Tem SiloDNA canônico? Só quem tem pode ser a identidade sobrevivente. */
  hasCanonicalSilo: boolean;
};

export type ExactPublishedRootDuplicate = {
  canonicalTerritoryRef: string;
  duplicateTerritoryRef: string;
  catalogEntryId: string | null;
  normalizedUrl: string | null;
  reason: string;
};

const raiz = (territory: TerritoryIdentity) => {
  const id = territory.publishedStructureRef?.catalogEntryId?.trim();
  const url = territory.publishedStructureRef?.normalizedUrl?.trim();
  return { id: id || null, url: url || null, chave: id || url || null };
};

/** Lifecycles que já não participam de proposta alguma. */
const FORA_DO_JOGO = new Set(["superseded", "archived", "rejected"]);

/**
 * Pares em que um candidato aponta para a mesma raiz publicada de um
 * território já consolidado/confirmado.
 *
 * O sobrevivente é sempre o que tem estrutura canônica — não o mais antigo,
 * não o de nome melhor. Sem SiloDNA, ninguém é a identidade de nada.
 */
export function detectExactPublishedRootDuplicates(
  territories: readonly TerritoryIdentity[],
): ExactPublishedRootDuplicate[] {
  const vivos = territories.filter(item => !FORA_DO_JOGO.has(item.lifecycleStatus));
  const canonicos = vivos.filter(item =>
    item.hasCanonicalSilo && ["consolidated", "confirmed"].includes(item.lifecycleStatus));

  const duplicatas: ExactPublishedRootDuplicate[] = [];
  for (const candidato of vivos) {
    if (candidato.lifecycleStatus !== "candidate") continue;
    const raizCandidato = raiz(candidato);
    if (!raizCandidato.chave) continue;

    const gemeo = canonicos.find(item => {
      const raizCanonica = raiz(item);
      if (!raizCanonica.chave) return false;
      // Identidade estrutural: mesma entrada de catálogo OU mesma URL.
      return (raizCandidato.id && raizCandidato.id === raizCanonica.id)
        || (raizCandidato.url && raizCandidato.url === raizCanonica.url);
    });
    if (!gemeo) continue;

    duplicatas.push({
      canonicalTerritoryRef: gemeo.territoryRef,
      duplicateTerritoryRef: candidato.territoryRef,
      catalogEntryId: raizCandidato.id,
      normalizedUrl: raizCandidato.url,
      reason: `Aponta para a mesma raiz publicada de "${gemeo.name ?? gemeo.territoryRef}"`
        + `${raizCandidato.id ? ` (catalogEntryId ${raizCandidato.id})` : ` (${raizCandidato.url})`}`
        + ", que já tem Silo canônico.",
    });
  }
  return duplicatas;
}

/* ------------------------ marcar como substituído ------------------------ */

export type SupersedeReadiness =
  | { state: "ready"; canonicalTerritoryRef: string; reason: string }
  | { state: "blocked"; reason: string };

/**
 * Só se marca como substituído um Silo que não tem mais busca atribuída.
 *
 * Os leitores EXCLUEM `superseded` da análise. Marcar com keyword dentro
 * deixaria a busca presa num território invisível — some da proposta e não
 * volta a lugar nenhum. Restaurar primeiro, marcar depois.
 */
export function resolveSupersedeReadiness(input: {
  duplicate: ExactPublishedRootDuplicate | null;
  assignedKeywordCount: number;
}): SupersedeReadiness {
  if (!input.duplicate) {
    return { state: "blocked", reason: "Este Silo não é duplicata comprovada de nenhum Silo canônico." };
  }
  if (input.assignedKeywordCount > 0) {
    return {
      state: "blocked",
      reason: `Este Silo candidato ainda possui ${input.assignedKeywordCount} busca(s) atribuída(s). `
        + "Restaure-as ao Silo canônico antes de marcá-lo como substituído.",
    };
  }
  return {
    state: "ready",
    canonicalTerritoryRef: input.duplicate.canonicalTerritoryRef,
    reason: input.duplicate.reason,
  };
}

/* ---------------------- precedência na análise --------------------------- */

/**
 * O candidato duplicado NÃO concorre por score com o seu canônico.
 *
 * `scoreSiloFit` ordena por afinidade de tokens e o desempate cai na ordem da
 * lista. Com dois territórios de mesmo nome e mesma raiz, isso é sorteio — e
 * foi assim que o candidato de campos vazios venceu um consolidado com
 * SiloDNA, SiloPage e fronteira declarada.
 *
 * Devolve os refs que devem sair da disputa. Não altera pontuação nenhuma:
 * remove da lista quem não deveria estar nela.
 */
export function territoryRefsOutOfCompetition(
  territories: readonly TerritoryIdentity[],
): Set<string> {
  return new Set(detectExactPublishedRootDuplicates(territories).map(item => item.duplicateTerritoryRef));
}
