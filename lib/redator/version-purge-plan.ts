/**
 * ===== ELEGIBILIDADE DAS VERSÕES DO REDATOR =====
 *
 * Puro: sem I/O, sem `server-only`. Decide; não executa.
 *
 * ==================== O QUE ENTRA, E SÓ ====================
 *
 * Versões de `content_documents` (artigo) e de `writer_deliverables` (roteiro e
 * carrossel). Mais nada.
 *
 * FORA, e o teste prova a ausência: ArticleDNA, KeywordDNA, SiloDNA/SiloPage,
 * SERP, evidências do Radar, `editorial_artifact_versions` e logs MCP. Essas
 * tabelas são append-only por gatilho e não têm janela de retenção — não é que
 * elas "ainda não" sejam purgadas; é que elas nunca são.
 *
 * ==================== AUTOSAVE NÃO É VERSÃO ====================
 *
 * Salvar rascunho não cria versão histórica: o autosave grava estado corrente.
 * Só finalizar cria versão, e só a predecessora de uma finalização substituída
 * entra em janela. O purge não precisa filtrar autosave porque autosave nunca
 * chega a ser linha de versão.
 *
 * ==================== IDADE NUNCA BASTA ====================
 *
 * `created_at` não aparece em nenhuma condição deste módulo, de propósito. O
 * que autoriza apagar é ter sido SUBSTITUÍDA e a janela ter vencido.
 */

export type VersionKind = "content_document" | "writer_deliverable";

export type VersionPurgeRow = {
  versionId: string;
  kind: VersionKind;
  /** `document_id` ou `deliverable_id`, conforme o tipo. */
  ownerId: string;
  brandId: string;
  /** A versão que o dono aponta como corrente AGORA. */
  currentVersionId: string | null;
  supersededAt: string | null;
  supersededByVersionId: string | null;
  purgeAfter: string | null;
};

export type VersionPurgeRefusal =
  | "not_superseded"
  | "no_successor"
  | "no_purge_after"
  | "window_open"
  /** É a versão corrente do dono. Nunca sai, por mais antiga que seja. */
  | "is_current"
  /** Um elo de `superseded_by_version_id` aponta para versão inexistente. */
  | "successor_missing"
  /** Algum elo pertence a outro dono ou outra marca. */
  | "successor_scope_mismatch"
  /** A cadeia volta sobre si mesma. */
  | "chain_cycle"
  /** A cadeia termina sem chegar à versão corrente do dono. */
  | "chain_no_current"
  | "chain_too_long";

export type VersionPurgeDecision =
  | { eligible: true; versionId: string; kind: VersionKind; ownerId: string; successorVersionId: string; currentVersionId: string; chainLength: number }
  | { eligible: false; versionId: string; kind: VersionKind; refusal: VersionPurgeRefusal };

const LIMITE_DA_CADEIA = 512;

/**
 * ===== A CADEIA DE VERSÕES, PELO MESMO MOTIVO DA MÍDIA =====
 *
 * Em `v1 → v2 → v3(corrente)`, quando a janela de `v1` vencer a `v2` já estará
 * substituída. Exigir que o sucessor DIRETO fosse o corrente reteria `v1` para
 * sempre — e artigos finalizados muitas vezes acumulam mais elos que imagens.
 *
 * O que autoriza apagar `v1` é a cadeia dela desembocar na versão corrente do
 * dono. Quantos elos há no caminho não importa; que ela chegue lá, sim.
 *
 * `v2` continua protegida: ela tem janela própria, e só sai quando a dela
 * vencer. Purgar `v1` não antecipa nada para `v2`.
 */
export function resolveVersionChain(input: {
  from: VersionPurgeRow;
  rows: readonly VersionPurgeRow[];
}): { ok: true; currentVersionId: string; length: number } | { ok: false; refusal: VersionPurgeRefusal } {
  const { from, rows } = input;
  const porId = new Map(rows.map(linha => [linha.versionId, linha]));
  const visitados = new Set<string>([from.versionId]);

  let atual = from;
  let passos = 0;

  while (atual.supersededByVersionId) {
    if (++passos > LIMITE_DA_CADEIA) return { ok: false, refusal: "chain_too_long" };

    const proximo = porId.get(atual.supersededByVersionId);
    if (!proximo) return { ok: false, refusal: "successor_missing" };
    if (visitados.has(proximo.versionId)) return { ok: false, refusal: "chain_cycle" };
    visitados.add(proximo.versionId);

    /* Todo elo pertence ao MESMO dono, na mesma marca. */
    if (proximo.ownerId !== from.ownerId || proximo.brandId !== from.brandId || proximo.kind !== from.kind) {
      return { ok: false, refusal: "successor_scope_mismatch" };
    }

    /* Chegou à corrente do dono? É o fim que autoriza. */
    if (from.currentVersionId && proximo.versionId === from.currentVersionId) {
      return { ok: true, currentVersionId: proximo.versionId, length: passos };
    }
    /* Fim da cadeia sem ser a corrente: a posição ficou sem dono vivo. */
    if (!proximo.supersededAt) return { ok: false, refusal: "chain_no_current" };

    atual = proximo;
  }

  return { ok: false, refusal: "chain_no_current" };
}

/**
 * ===== AS CONDIÇÕES =====
 *
 * `is_current` é conferido explicitamente mesmo com a FK RESTRICT do banco
 * impedindo o DELETE: o erro de FK chegaria como 23503 cru, tarde, e sem dizer
 * qual regra foi violada. A condição nomeada diz o porquê antes de tentar.
 */
export function planVersionPurge(
  row: VersionPurgeRow,
  rows: readonly VersionPurgeRow[],
  now: Date | string,
): VersionPurgeDecision {
  const comum = { versionId: row.versionId, kind: row.kind };

  if (row.currentVersionId && row.currentVersionId === row.versionId) {
    return { eligible: false, ...comum, refusal: "is_current" };
  }
  if (!row.supersededAt) return { eligible: false, ...comum, refusal: "not_superseded" };
  if (!row.supersededByVersionId) return { eligible: false, ...comum, refusal: "no_successor" };
  if (!row.purgeAfter) return { eligible: false, ...comum, refusal: "no_purge_after" };

  const limite = new Date(row.purgeAfter).getTime();
  const agora = (now instanceof Date ? now : new Date(now)).getTime();
  if (!Number.isFinite(limite) || agora < limite) return { eligible: false, ...comum, refusal: "window_open" };

  /* Sem corrente declarada não há alvo para a cadeia alcançar. */
  if (!row.currentVersionId) return { eligible: false, ...comum, refusal: "chain_no_current" };

  const cadeia = resolveVersionChain({ from: row, rows });
  if (!cadeia.ok) return { eligible: false, ...comum, refusal: cadeia.refusal };

  return {
    eligible: true, ...comum, ownerId: row.ownerId,
    successorVersionId: row.supersededByVersionId,
    currentVersionId: cadeia.currentVersionId, chainLength: cadeia.length,
  };
}

/**
 * As tabelas que o purge de versões pode tocar. Lista fechada, por nome.
 *
 * Existe para ser conferida por teste: qualquer tabela acrescentada aqui passa
 * a ser apagável, e essa decisão não pode acontecer por descuido.
 */
export const VERSION_PURGE_TABLES = ["content_document_versions", "writer_deliverable_versions"] as const;

/** O que o purge NUNCA toca. Também lista fechada, também conferida por teste. */
export const PURGE_FORBIDDEN_TABLES = [
  "editorial_artifact_versions",
  "editorial_decision_events",
  "editorial_serp_reviews",
  "editorial_serp_snapshots",
  "editorial_version_status_events",
  "writer_mcp_call_events",
] as const;
