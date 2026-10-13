import { effectiveVersionStatus } from "./operational-flow.ts";

/**
 * TELAS LEEM SÓ A COR ESCOLHIDA (SDD `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`,
 * item 6; SDD 2026-10-12 §8). Regras puras, sem banco e sem React:
 *
 * - qual recorte a mesa pede (`workspaceReadScopeFor`): uma cor que resolve
 *   para UM grupo, ou "Sem grupo"; "Todos os grupos" (ou cor ainda pendente,
 *   ou cor com mais de um grupo) é a leitura de sempre;
 * - `detail=light` (`lightArtifactSelection`): de cada ArticleDNA/SiloDNA, só a
 *   versão vigente (a mais nova) e a última aprovada, mais as versões que um
 *   item do Radar ou um documento ainda referenciam, com os eventos delas —
 *   o histórico inteiro sai por `GET /api/editorial/workspace/versions`;
 * - a leitura parcial NUNCA tira da memória o que é de outro grupo
 *   (`mergeScopedById`): vazio não substitui válido (`AGENTS.md` §10).
 */

export type WorkspaceGroupScreenFilter =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "group"; groupId: string }
  | { kind: "groups"; groupIds: readonly string[] };

export type WorkspaceReadScope = { groupId: string | null; detail: "full" | "light" };

export const WORKSPACE_GROUP_NONE = "sem-grupo";

/** O recorte que a mesa pede ao servidor. `pending` = a cor ainda não resolveu: espere, não leia tudo por engano. */
export function workspaceReadScopeFor(input: { filter: WorkspaceGroupScreenFilter; pending: boolean; detail?: "full" | "light" }): { ready: boolean; scope: WorkspaceReadScope } {
  const detail = input.detail ?? "full";
  if (input.pending) return { ready: false, scope: { groupId: null, detail } };
  const filter = input.filter;
  if (filter.kind === "none") return { ready: true, scope: { groupId: WORKSPACE_GROUP_NONE, detail } };
  if (filter.kind === "group") return { ready: true, scope: { groupId: filter.groupId, detail } };
  if (filter.kind === "groups" && filter.groupIds.length === 1) return { ready: true, scope: { groupId: filter.groupIds[0], detail } };
  return { ready: true, scope: { groupId: null, detail } };
}

/** A URL da leitura da mesa: sem recorte e sem `light`, exatamente a de sempre. */
export function workspaceReadUrl(brandId: string, scope: WorkspaceReadScope | null | undefined): string {
  const partes = [`marcaId=${encodeURIComponent(brandId)}`];
  if (scope?.groupId) partes.push(`groupId=${encodeURIComponent(scope.groupId)}`);
  if (scope?.detail === "light") partes.push("detail=light");
  return `/api/editorial/workspace?${partes.join("&")}`;
}

/** A chave da cópia local: "todos" é a de sempre; um recorte tem a sua (o parcial nunca sobrescreve o inteiro). */
export function scopedRecoveryKey(baseKey: string, groupId: string | null | undefined): string {
  return groupId ? `${baseKey}:${groupId}` : baseKey;
}

type Versao = { versionId: string; versionNumber: number; entityKey: string };

/**
 * `detail=light`: por entidade, a mais nova e a última aprovada; mais as
 * versões referenciadas (`keepVersionIds`). Os eventos ficam só das versões
 * mantidas. Nada é inventado: é um subconjunto do que a leitura inteira traz.
 */
export function lightArtifactSelection<A, S, E extends { versionId: string; status: string }>(input: {
  articles: readonly A[];
  silos: readonly S[];
  events: readonly E[];
  articleOf: (version: A) => Versao;
  siloOf: (version: S) => Versao;
  keepVersionIds?: ReadonlySet<string>;
}): { articles: A[]; silos: S[]; events: E[]; droppedVersions: number } {
  const manter = new Set<string>(input.keepVersionIds ?? []);
  const escolher = <T>(lista: readonly T[], de: (version: T) => Versao) => {
    const porEntidade = new Map<string, T[]>();
    for (const versao of lista) {
      const chave = de(versao).entityKey;
      porEntidade.set(chave, [...(porEntidade.get(chave) ?? []), versao]);
    }
    const ficam = new Set<string>();
    for (const versoes of porEntidade.values()) {
      const ordenadas = [...versoes].sort((a, b) => de(b).versionNumber - de(a).versionNumber);
      ficam.add(de(ordenadas[0]).versionId);
      const aprovada = ordenadas.find(versao => effectiveVersionStatus(de(versao).versionId, input.events as never) === "approved");
      if (aprovada) ficam.add(de(aprovada).versionId);
    }
    return lista.filter(versao => ficam.has(de(versao).versionId) || manter.has(de(versao).versionId));
  };
  const articles = escolher(input.articles, input.articleOf);
  const silos = escolher(input.silos, input.siloOf);
  const mantidas = new Set([...articles.map(version => input.articleOf(version).versionId), ...silos.map(version => input.siloOf(version).versionId)]);
  return {
    articles,
    silos,
    events: input.events.filter(event => mantidas.has(event.versionId)),
    droppedVersions: input.articles.length + input.silos.length - articles.length - silos.length,
  };
}

/**
 * A leitura de um recorte só troca o que é DESTE recorte: o que a memória tem
 * de outro grupo fica. `inScope` diz se o item é do recorte lido.
 */
export function mergeScopedById<T>(current: readonly T[], incoming: readonly T[], inScope: (item: T) => boolean): T[] {
  return [...current.filter(item => !inScope(item)), ...incoming];
}
