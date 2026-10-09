import { resolveVersionAuthority } from "../arquiteto/canonical-version-authority.ts";
import { effectiveVersionStatus } from "../editorial/operational-flow.ts";

/**
 * ===== 2026-10-09 · A VERSÃO VIGENTE DO ARTICLEDNA, POR UMA REGRA SÓ =====
 *
 * O núcleo do dossiê portátil escolhia a versão com `find()` sobre a lista do
 * acervo — e `ArtifactRepository.list` não ordena. Com duas versões do mesmo
 * artigo (o reajuste grava uma sucessora aprovada), o CSV, o artigo-modelo e a
 * prontidão podiam descrever a versão antiga ou a nova conforme a ordem em que
 * o banco devolveu as linhas.
 *
 * A regra é a da plataforma (`lib/arquiteto/canonical-version-authority.ts`,
 * a mesma da mesa do Arquiteto): responde pelo artigo a ÚLTIMA APROVADA, pelo
 * número da versão, com o status efetivo do último evento
 * (`effectiveVersionStatus`). Rejeitada e substituída saem da disputa. Uma
 * proposta mais nova não tira a autoridade da aprovada. Sem nenhuma aprovada
 * (acervo sem eventos), vale a mais nova viva — sempre a mesma, nunca a primeira
 * que a leitura devolveu.
 *
 * ===== 2026-10-09 (correção) · NO RADAR, VALE A VERSÃO TRANSPORTADA PELO ITEM =====
 *
 * O item do Radar carrega a versão que o Arquiteto ENVIOU
 * (`RadarItem.articleDnaVersionId`, a coluna `source_version_id` do item, o
 * vínculo do congelamento). A investigação, a planta e o pacote foram feitos
 * sobre ela. "Gravar melhorias" grava uma sucessora já aprovada, mas nada
 * atualiza o item que já está no Radar: escolher a última aprovada travava o
 * artigo (a coleta recusava, o export e o envio davam ARTICLE_VERSION_MISMATCH).
 *
 * Por isso `transportedVersionId`: quando vem e existe uma versão DESTE artigo e
 * DESTA marca com esse id, ela é a devolvida, mesmo com uma aprovada mais nova.
 * Sem ele, ou sem a versão, vale a regra acima. A versão nova só chega ao Radar
 * pelo reenvio da versão nova ao Radar (proposta registrada no backlog do Radar
 * e do Arquiteto, com SDD própria).
 *
 * Módulo puro: sem servidor, sem banco.
 */

type VersaoDoArtigo = {
  versionId: string;
  versionNumber: number;
  payload: { articleId: string; brandId: string };
};

type EventoDeStatus = { versionId: string; status: string };

export function radarCurrentArticleDnaVersion<T extends VersaoDoArtigo>(input: {
  versions: readonly T[];
  /** Os eventos de status do acervo, na ordem em que aconteceram (`ArtifactRepository.list` os lê por `occurred_at`). */
  events: readonly EventoDeStatus[];
  brandId: string;
  articleId: string;
  /**
   * 2026-10-09 (correção) · A versão que o item do Radar transporta (a que o
   * Arquiteto enviou). Existindo neste artigo e nesta marca, ela vale, mesmo com
   * uma aprovada mais nova. Ausente ou desconhecida, vale a regra da mesa.
   */
  transportedVersionId?: string | null;
}): T | null {
  const doArtigo = input.versions.filter(versao => versao.payload.articleId === input.articleId && versao.payload.brandId === input.brandId);
  if (!doArtigo.length) return null;
  const transportada = typeof input.transportedVersionId === "string" ? input.transportedVersionId.trim() : "";
  if (transportada) {
    /* O id é único: a escolha não depende da ordem da leitura. */
    const enviada = doArtigo.find(versao => versao.versionId === transportada);
    if (enviada) return enviada;
  }
  const eventos = input.events as Parameters<typeof effectiveVersionStatus>[1];
  /* O empate de número (não deveria existir) é desfeito pelo id: a escolha nunca depende da ordem da leitura. */
  const ordenadas = [...doArtigo].sort((a, b) => a.versionNumber - b.versionNumber || a.versionId.localeCompare(b.versionId));
  const autoridade = resolveVersionAuthority({ versions: ordenadas, statusOf: versionId => effectiveVersionStatus(versionId, eventos) });
  return autoridade.canonical ?? autoridade.latest ?? null;
}

/**
 * 2026-10-09 (correção) · A VERSÃO QUE O ITEM DO RADAR TRANSPORTA, lida da linha
 * do fluxo (`editorial_workflow_items`) ou do próprio `RadarItem`: primeiro
 * `payload.articleDnaVersionId` (o RadarItem gravado no envio), depois o campo
 * do item já parseado, por último a coluna `source_version_id`. Os três nascem
 * iguais no `import_radar`. Sem nenhum, `null` (vale a regra da mesa).
 */
export function radarTransportedArticleDnaVersionIdOf(item: unknown): string | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const linha = item as { payload?: unknown; articleDnaVersionId?: unknown; source_version_id?: unknown };
  const payload = linha.payload && typeof linha.payload === "object" && !Array.isArray(linha.payload)
    ? linha.payload as { articleDnaVersionId?: unknown }
    : null;
  for (const valor of [payload?.articleDnaVersionId, linha.articleDnaVersionId, linha.source_version_id]) {
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }
  return null;
}
