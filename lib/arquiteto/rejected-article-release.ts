/**
 * ===== A MESA APLICA O EVENTO `rejected` (2026-10-12) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §11,
 * passo 6 (limite conhecido da F4) e §18.1.
 *
 * "Retirar artigo do Silo" grava o evento `rejected` na versão vigente do
 * ArticleDNA (`editorial_version_status_events`); a linha da versão continua
 * `approved`, e a leitura da mesa olhava só a linha. Resultado: as keywords do
 * artigo retirado ficavam presas no artigo rejeitado, em vez de voltarem para
 * "Keywords não agrupadas" — e a invariante diz que toda keyword importada
 * está em artigo ou em "Keywords não agrupadas".
 *
 * Esta é a LEITURA (nada é apagado nem regravado):
 *
 *   1. status efetivo de cada versão vigente = último evento; sem evento, o da
 *      linha (a mesma regra de `global-workflow-canonical.ts`);
 *   2. entidade cuja versão VIGENTE está `rejected` sai dos artigos ativos (a
 *      versão anterior não volta: rejeitar a vigente rejeita o artigo);
 *   3. as keywords dele que nenhum artigo ativo usa são LIBERADAS na projeção
 *      do item de workflow: a atribuição que apontava para o artigo rejeitado
 *      (cluster, grupo provisório, artigo de trabalho, formação humana anterior
 *      à rejeição) chega nula. Decisão humana POSTERIOR à rejeição fica.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */
import type { ArticleDNA, VersionEnvelope } from "./contracts.ts";
import { articleDnaIncorporatedKeywordIds } from "./declared-subject.ts";

export type VersionStatusLike = { versionId: string; status: string };
/** Eventos na ordem de `occurred_at` (o último vence). */
export type VersionEventLike = { versionId: string; status: string; occurredAt?: string | null; reason?: string | null };

export type WorkflowItemLike = { subjectType: string; subjectId: string; payload: Record<string, unknown> };

export type RejectedArticleRelease = {
  articleId: string;
  entityId: string;
  versionId: string;
  versionNumber: number;
  rejectedAt: string | null;
  reason: string | null;
  /** Keywords do artigo que nenhum artigo ativo usa: voltam para "Keywords não agrupadas". */
  releasedKeywordIds: string[];
};

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** O status efetivo: o último evento; sem evento, o da linha. */
export function effectiveArtifactStatus(versionId: string, rowStatus: string | null, events: readonly VersionEventLike[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) if (events[index].versionId === versionId) return events[index].status;
  return rowStatus;
}

const ASSIGNMENT_ARTICLE_KEYS = ["clusterId", "provisionalGroupId", "workingArticleId"] as const;

/** F5 · D6 — a marca de leitura da keyword liberada por artigo rejeitado (projeção do item, nunca gravada). */
export const REJECTED_ARTICLE_RELEASE_KEY = "rejectedArticleRelease" as const;

/**
 * F5 · D6 — por que a keyword liberada fica fora da formação automática, ou
 * `null` quando ela não foi liberada (ou já tem decisão humana posterior).
 * Lida do payload do item (`canonicalWorkflow.payload`).
 */
export function rejectedArticleReleaseHold(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const marca = record[REJECTED_ARTICLE_RELEASE_KEY];
  if (!marca || typeof marca !== "object") return null;
  if (text(record.articleFormationRef)) return null;
  const release = marca as Record<string, unknown>;
  const quando = text(release.rejectedAt);
  const data = quando && Number.isFinite(Date.parse(quando)) ? ` em ${quando.slice(8, 10)}/${quando.slice(5, 7)}` : "";
  const motivo = text(release.reason);
  return `liberada do artigo retirado do Silo${data}${motivo ? ` (“${motivo}”)` : ""}: fica em “Keywords não agrupadas” do grupo dela até decisão humana — a formação automática não a reagrupa (D6)`;
}

/**
 * Aplica a rejeição às versões VIGENTES (`latestByEntity` já aplicado).
 * Devolve os artigos ativos, os status com o efetivo dos rejeitados, os itens
 * de workflow com as keywords liberadas e a lista do que foi liberado.
 */
export function releaseRejectedArticles<W extends WorkflowItemLike>(input: {
  articleDnas: readonly VersionEnvelope<ArticleDNA>[];
  statuses: readonly VersionStatusLike[];
  events: readonly VersionEventLike[];
  workflowItems: readonly W[];
}): {
  articleDnas: VersionEnvelope<ArticleDNA>[];
  statuses: VersionStatusLike[];
  workflowItems: W[];
  rejected: RejectedArticleRelease[];
} {
  const linha = new Map(input.statuses.map(item => [item.versionId, item.status]));
  const rejeitadas: VersionEnvelope<ArticleDNA>[] = [];
  const ativas: VersionEnvelope<ArticleDNA>[] = [];
  for (const version of input.articleDnas) {
    (effectiveArtifactStatus(version.versionId, linha.get(version.versionId) ?? null, input.events) === "rejected" ? rejeitadas : ativas).push(version);
  }
  if (!rejeitadas.length) {
    return { articleDnas: [...input.articleDnas], statuses: [...input.statuses], workflowItems: [...input.workflowItems], rejected: [] };
  }

  const usadasPorAtivos = new Set(ativas.flatMap(version => articleDnaIncorporatedKeywordIds(version.payload)));
  const rejected: RejectedArticleRelease[] = rejeitadas.map(version => {
    const evento = [...input.events].reverse().find(item => item.versionId === version.versionId && item.status === "rejected");
    return {
      articleId: version.payload.articleId,
      entityId: version.entityId,
      versionId: version.versionId,
      versionNumber: version.versionNumber,
      rejectedAt: text(evento?.occurredAt),
      reason: text(evento?.reason),
      releasedKeywordIds: [...new Set(articleDnaIncorporatedKeywordIds(version.payload))].filter(id => !usadasPorAtivos.has(id)),
    };
  });

  const liberacao = new Map<string, RejectedArticleRelease>();
  for (const item of rejected) for (const keywordId of item.releasedKeywordIds) if (!liberacao.has(keywordId)) liberacao.set(keywordId, item);

  const workflowItems = input.workflowItems.map(item => {
    const artigo = item.subjectType === "keyword" ? liberacao.get(item.subjectId) : undefined;
    if (!artigo) return item;
    const refs = new Set([artigo.articleId, artigo.entityId]);
    const payload: Record<string, unknown> = { ...item.payload };
    let mudou = false;
    for (const key of ASSIGNMENT_ARTICLE_KEYS) {
      const valor = text(payload[key]);
      if (valor && refs.has(valor)) { payload[key] = null; mudou = true; }
    }
    let formacao = text(payload.articleFormationRef);
    if (formacao) {
      const decisao = payload.articleFormationDecision && typeof payload.articleFormationDecision === "object" ? payload.articleFormationDecision as Record<string, unknown> : {};
      const decididoEm = text(decisao.decidedAt);
      // A formação que gerou o artigo rejeitado é liberada; uma decisão humana posterior à rejeição fica.
      const anterior = !artigo.rejectedAt || !decididoEm || Date.parse(decididoEm) <= Date.parse(artigo.rejectedAt);
      if (refs.has(formacao) || anterior) {
        payload.articleFormationRef = null;
        payload.articleFormationDecision = null;
        formacao = null;
        mudou = true;
      }
    }
    /*
     * F5 · D6 (decisão do dono): a keyword LIBERADA fica presa em "Keywords não
     * agrupadas" do grupo dela — a formação automática não a reagrupa sozinha.
     * A marca é só de leitura (nada é gravado); decisão humana posterior à
     * rejeição (formação nova) a tira daqui, porque aí ela não está livre.
     */
    if (!formacao) {
      payload[REJECTED_ARTICLE_RELEASE_KEY] = { articleId: artigo.articleId, versionId: artigo.versionId, rejectedAt: artigo.rejectedAt, reason: artigo.reason };
      mudou = true;
    }
    return mudou ? { ...item, payload } : item;
  });

  const rejeitadasIds = new Set(rejeitadas.map(version => version.versionId));
  const statuses = input.statuses.map(item => (rejeitadasIds.has(item.versionId) ? { ...item, status: "rejected" } : item));
  return { articleDnas: ativas, statuses, workflowItems, rejected };
}

/**
 * ===== 2026-10-18 · A MESA APLICA O EVENTO `rejected` TAMBÉM NO PAR DO SILO =====
 *
 * "Desfazer Silo" no Silo inteiro (decisão do dono, "Manter em duas etapas")
 * grava o evento `rejected` na versão vigente do SiloDNA e da SiloPage — a
 * mesma regra dos artigos acima. A leitura da mesa aplica o evento: o par cuja
 * versão VIGENTE está `rejected` sai dos Silos ativos (a versão anterior não
 * volta), e a SiloPage do SiloDNA rejeitado sai junto. Nada é apagado nem
 * regravado; sem evento, a mesa de sempre.
 */
export function releaseRejectedSiloPairs<D extends { versionId: string; payload: { siloId: string } }, P extends { versionId: string; payload: { siloId: string } }>(input: {
  siloDnas: readonly D[];
  siloPages: readonly P[];
  statuses: readonly VersionStatusLike[];
  events: readonly VersionEventLike[];
}): { siloDnas: D[]; siloPages: P[]; rejectedSiloIds: string[] } {
  const linha = new Map(input.statuses.map(item => [item.versionId, item.status]));
  const rejeitada = (versionId: string) => effectiveArtifactStatus(versionId, linha.get(versionId) ?? null, input.events) === "rejected";
  const silosRejeitados = new Set(input.siloDnas.filter(version => rejeitada(version.versionId)).map(version => version.payload.siloId));
  if (!silosRejeitados.size && !input.siloPages.some(version => rejeitada(version.versionId))) {
    return { siloDnas: [...input.siloDnas], siloPages: [...input.siloPages], rejectedSiloIds: [] };
  }
  return {
    siloDnas: input.siloDnas.filter(version => !silosRejeitados.has(version.payload.siloId)),
    siloPages: input.siloPages.filter(version => !silosRejeitados.has(version.payload.siloId) && !rejeitada(version.versionId)),
    rejectedSiloIds: [...silosRejeitados].sort(),
  };
}
