/**
 * ===== CORTE 5 · O SERVIÇO DE PURGA DO REDATOR =====
 *
 * ==================== DRY-RUN PRIMEIRO, E POR PADRÃO ====================
 *
 * `planWriterPurge` **não escreve nada**: nem banco, nem Storage. Ele lê,
 * aplica as regras puras e devolve a lista do que sairia. É o único modo que
 * esta rodada exercita.
 *
 * `executeWriterPurge` existe para o disparo futuro e está escrito, mas nada no
 * repositório o chama sem token operacional — ver a rota.
 *
 * ==================== A AUTORIDADE É A DA M2 E DA M3 ====================
 *
 * Nenhum DELETE sai daqui. Quem apaga é:
 *
 *   mídia    `lifecycle_confirm_writer_media_purge`   (M3)
 *   versões  `lifecycle_purge_editorial_history`      (M2)
 *
 * Ambas SECURITY DEFINER, com GRANT só para `service_role`, e ambas revalidam a
 * elegibilidade sob lock. As regras em código existem para dar diagnóstico e
 * para decidir a ORDEM — não para substituir a decisão do banco.
 *
 * ==================== NADA DISSO É ALCANÇÁVEL PELO NAVEGADOR ====================
 *
 * `server-only`, chamado por uma rota protegida por token operacional. Nenhum
 * componente React importa este módulo, e nenhum usuário autenticado comum tem
 * caminho até ele.
 */

import "server-only";
import { getOperationalClient } from "./editorial-db";
import {
  canDeleteRowAfterStorage, classifyStorageRemoval, planMediaPurge, summarizePurge,
  type MediaPurgeRow, type PurgeOutcome, type StorageRemovalOutcome,
} from "../redator/media-purge-plan.ts";
import { planVersionPurge, type VersionPurgeRow } from "../redator/version-purge-plan.ts";

export {
  canDeleteRowAfterStorage, classifyStorageRemoval, planMediaPurge, summarizePurge,
} from "../redator/media-purge-plan.ts";
export { planVersionPurge, PURGE_FORBIDDEN_TABLES, VERSION_PURGE_TABLES } from "../redator/version-purge-plan.ts";

export type PurgeMode = "dry_run" | "execute";

/* ==========================================================================
 * LEITURA — só SELECT, em nenhum momento escrita
 * ========================================================================== */

const CAMPOS_MEDIA = "id,marca_id,document_id,status,storage_path,anchor_kind,anchor_ref,superseded_at,purge_after,replaced_by_asset_id";

async function lerMediaDaMarca(brandId: string): Promise<MediaPurgeRow[]> {
  const { data, error } = await getOperationalClient().from("writer_media_assets")
    .select(CAMPOS_MEDIA).eq("marca_id", brandId);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(linha => ({
    assetId: String(linha.id),
    brandId: String(linha.marca_id),
    documentId: String(linha.document_id),
    status: linha.status as MediaPurgeRow["status"],
    storagePath: (linha.storage_path as string | null) ?? null,
    anchorKind: (linha.anchor_kind as string | null) ?? null,
    anchorRef: (linha.anchor_ref as string | null) ?? null,
    supersededAt: (linha.superseded_at as string | null) ?? null,
    purgeAfter: (linha.purge_after as string | null) ?? null,
    replacedByAssetId: (linha.replaced_by_asset_id as string | null) ?? null,
  }));
}

/**
 * Versões, com o `current_version_id` do DONO junto.
 *
 * A M2 tem função de purga, mas não tem contrapartida de leitura: ela só apaga.
 * O dry-run precisa do MESMO predicado sem escrever, então ele é um SELECT com
 * as mesmas condições. A autoridade de apagar continua sendo a RPC — isto aqui
 * não é um segundo mecanismo, é a leitura que faltava.
 */
async function lerVersoesDaMarca(brandId: string): Promise<VersionPurgeRow[]> {
  const cliente = getOperationalClient();

  const documentos = await cliente.from("content_document_versions")
    .select("version_id,document_id,superseded_at,superseded_by_version_id,purge_after,content_documents!inner(marca_id,current_version_id)")
    .eq("content_documents.marca_id", brandId);

  const entregaveis = await cliente.from("writer_deliverable_versions")
    .select("version_id,deliverable_id,superseded_at,superseded_by_version_id,purge_after,writer_deliverables!inner(marca_id,current_version_id)")
    .eq("writer_deliverables.marca_id", brandId);

  const mapear = (linhas: unknown, kind: VersionPurgeRow["kind"], dono: string, relacao: string): VersionPurgeRow[] => {
    if (!Array.isArray(linhas)) return [];
    return linhas.map((item: Record<string, unknown>) => {
      const pai = (item[relacao] ?? {}) as Record<string, unknown>;
      return {
        versionId: String(item.version_id),
        kind, ownerId: String(item[dono]),
        brandId: String(pai.marca_id ?? brandId),
        currentVersionId: (pai.current_version_id as string | null) ?? null,
        supersededAt: (item.superseded_at as string | null) ?? null,
        supersededByVersionId: (item.superseded_by_version_id as string | null) ?? null,
        purgeAfter: (item.purge_after as string | null) ?? null,
      };
    });
  };

  return [
    ...mapear(documentos.data, "content_document", "document_id", "content_documents"),
    ...mapear(entregaveis.data, "writer_deliverable", "deliverable_id", "writer_deliverables"),
  ];
}

/* ==========================================================================
 * DRY-RUN
 * ========================================================================== */

export type MediaDryRunItem = {
  tipo: "media";
  assetId: string;
  brandId: string;
  documentId: string;
  anchorKind: string | null;
  anchorRef: string | null;
  storagePath: string | null;
  supersededAt: string | null;
  purgeAfter: string | null;
  successorAssetId: string;
};

export type VersionDryRunItem = {
  tipo: "version";
  versionId: string;
  kind: VersionPurgeRow["kind"];
  ownerId: string;
  brandId: string;
  supersededAt: string | null;
  purgeAfter: string | null;
  successorVersionId: string;
};

export type PurgeDryRun = {
  mode: "dry_run";
  brandId: string;
  avaliadoEm: string;
  elegiveis: number;
  itens: (MediaDryRunItem | VersionDryRunItem)[];
  /** Por que cada linha NÃO entrou. Diagnóstico, não ruído. */
  recusas: Record<string, number>;
};

/**
 * O que SAIRIA, sem que nada saia.
 *
 * Nenhuma escrita: só `select`. Se este módulo algum dia ganhar um `update` no
 * caminho de dry-run, o teste que lê este arquivo falha.
 */
export async function planWriterPurge(input: { brandId: string; limit?: number }): Promise<PurgeDryRun> {
  const agora = new Date();
  const limite = Math.max(1, Math.min(input.limit ?? 50, 500));

  const mediaRows = await lerMediaDaMarca(input.brandId);
  const versionRows = await lerVersoesDaMarca(input.brandId);

  const itens: (MediaDryRunItem | VersionDryRunItem)[] = [];
  const recusas: Record<string, number> = {};
  const contar = (motivo: string) => { recusas[motivo] = (recusas[motivo] ?? 0) + 1; };

  for (const linha of mediaRows) {
    const decisao = planMediaPurge({ candidate: linha, rows: mediaRows, now: agora });
    if (!decisao.eligible) { contar(`media:${decisao.refusal}`); continue; }
    itens.push({
      tipo: "media", assetId: linha.assetId, brandId: linha.brandId, documentId: linha.documentId,
      anchorKind: linha.anchorKind, anchorRef: linha.anchorRef, storagePath: linha.storagePath,
      supersededAt: linha.supersededAt, purgeAfter: linha.purgeAfter,
      successorAssetId: decisao.successorAssetId,
    });
  }

  for (const linha of versionRows) {
    /* A cadeia é resolvida dentro do DONO: versões de outro documento não são elo. */
    const doMesmoDono = versionRows.filter(outra => outra.ownerId === linha.ownerId && outra.kind === linha.kind);
    const decisao = planVersionPurge(linha, doMesmoDono, agora);
    if (!decisao.eligible) { contar(`version:${decisao.refusal}`); continue; }
    itens.push({
      tipo: "version", versionId: linha.versionId, kind: linha.kind, ownerId: linha.ownerId,
      brandId: linha.brandId, supersededAt: linha.supersededAt, purgeAfter: linha.purgeAfter,
      successorVersionId: decisao.successorVersionId,
    });
  }

  /* Cronológica: o mais antigo primeiro, que é quem libera vínculo. */
  itens.sort((a, b) => String(a.purgeAfter ?? "").localeCompare(String(b.purgeAfter ?? "")));

  return {
    mode: "dry_run", brandId: input.brandId, avaliadoEm: agora.toISOString(),
    elegiveis: Math.min(itens.length, limite), itens: itens.slice(0, limite), recusas,
  };
}

/* ==========================================================================
 * EXECUÇÃO — escrita, e só pela autoridade do banco
 * ========================================================================== */

export type PurgeExecution = {
  mode: "execute";
  brandId: string;
  executadoEm: string;
  outcomes: PurgeOutcome[];
  resumo: ReturnType<typeof summarizePurge>;
  versoes: { documentVersionsPurged: number; deliverableVersionsPurged: number } | { erro: string };
};

/**
 * ===== ARQUIVO PRIMEIRO, LINHA DEPOIS, E RECONFERIR NO MEIO =====
 *
 *   dry-run (seleciona)
 *   → remove o objeto do Storage
 *   → "não existe" conta como já removido
 *   → RECONFERE a elegibilidade, agora contra o estado atual
 *   → CONFIRM da M3 apaga a linha, revalidando sob lock
 *   → readback: a linha sumiu mesmo?
 *
 * A reconferência no meio existe porque entre a seleção e a execução cabe uma
 * substituição, uma restauração ou outra passada. Se qualquer guarda deixou de
 * valer, o item é PULADO — nunca forçado.
 *
 * Se o Storage falhar por qualquer motivo que não seja ausência, a linha FICA.
 * Apagá-la deixaria o objeto no bucket sem dono e sem rastro.
 */
export async function executeWriterPurge(input: { brandId: string; limit?: number }): Promise<PurgeExecution> {
  const cliente = getOperationalClient();
  const plano = await planWriterPurge({ brandId: input.brandId, limit: input.limit });
  const outcomes: PurgeOutcome[] = [];

  for (const item of plano.itens) {
    if (item.tipo !== "media") continue;

    let storage: StorageRemovalOutcome = "removed";
    if (item.storagePath) {
      const resposta = await cliente.storage.from("writer-media").remove([item.storagePath]);
      storage = classifyStorageRemoval({ error: resposta.error });
    }
    if (!canDeleteRowAfterStorage(storage)) {
      outcomes.push({ assetId: item.assetId, result: "storage_failed", reason: "storage_remove_failed" });
      continue;
    }

    /* Reconferência: o mundo pode ter mudado desde a seleção. */
    const atuais = await lerMediaDaMarca(input.brandId);
    const alvo = atuais.find(linha => linha.assetId === item.assetId);
    if (!alvo) { outcomes.push({ assetId: item.assetId, result: "already_purged" }); continue; }
    const revalidado = planMediaPurge({ candidate: alvo, rows: atuais, now: new Date() });
    if (!revalidado.eligible) {
      outcomes.push({ assetId: item.assetId, result: "skipped", refusal: revalidado.refusal as never });
      continue;
    }

    const { data, error } = await cliente.rpc("lifecycle_confirm_writer_media_purge",
      { p_brand_id: input.brandId, p_asset_id: item.assetId });
    if (error) { outcomes.push({ assetId: item.assetId, result: "storage_failed", reason: error.code || "confirm_failed" }); continue; }

    const recibo = (data ?? {}) as Record<string, unknown>;
    const resultado = String(recibo.result ?? "");
    if (resultado === "purged") outcomes.push({ assetId: item.assetId, result: "purged", storage });
    else if (resultado === "already_purged") outcomes.push({ assetId: item.assetId, result: "already_purged" });
    else if (resultado === "referenced") outcomes.push({ assetId: item.assetId, result: "referenced" });
    else outcomes.push({ assetId: item.assetId, result: "not_eligible" });
  }

  /* Versões: a RPC da M2 seleciona e apaga na mesma transação, sob as mesmas guardas. */
  const versoes = await cliente.rpc("lifecycle_purge_editorial_history",
    { p_brand_id: input.brandId, p_limit: Math.max(1, Math.min(input.limit ?? 50, 500)) });

  return {
    mode: "execute", brandId: input.brandId, executadoEm: new Date().toISOString(),
    outcomes, resumo: summarizePurge(outcomes),
    versoes: versoes.error
      ? { erro: versoes.error.code || versoes.error.message || "purge_versions_failed" }
      : (versoes.data as { documentVersionsPurged: number; deliverableVersionsPurged: number }),
  };
}
