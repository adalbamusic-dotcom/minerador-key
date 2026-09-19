/**
 * ===== PRÉ-M3 · SUBSTITUIÇÃO DE MÍDIA COM TRANSFERÊNCIA DE ÂNCORA =====
 *
 * ==================== O QUE ESTE MÓDULO FAZ ====================
 *
 * Depois que um ativo NOVO já tem arquivo confirmado — upload feito, formato
 * verificado por magic bytes, hash conferido contra o readback do Storage —,
 * ele transfere a POSIÇÃO do ativo antigo para o novo, e só então coloca o
 * antigo na janela de 48h.
 *
 * Ele não faz upload, não calcula hash, não apaga arquivo e não apaga linha.
 * Quem sobe e confere é `uploadWriterMediaAsset`, que já existia e já era
 * rigoroso. O que faltava era ligar o resultado dele a uma posição.
 *
 * ==================== O DEFEITO QUE ISTO FECHA ====================
 *
 * Trocar a imagem de um bloco, cena ou slide não tinha caminho. O único retorno
 * era o 409 `asset_already_uploaded`, dizendo "crie outro briefing" — e o
 * briefing novo nascia sem vínculo com a posição do antigo. Sobrava um ativo
 * órfão e uma posição intacta com a imagem velha.
 *
 * ==================== A ORDEM, E POR QUE ELA É ESSA ====================
 *
 *   registrar sucessor SEM âncora
 *   → upload → formato/hash → readback do Storage
 *   → ESTE MÓDULO: troca atômica da âncora
 *   → readback da troca
 *   → só então o predecessor entra na janela de 48h
 *
 * A âncora é o último passo. Atribuí-la no briefing poria duas linhas
 * disputando a mesma posição enquanto a segunda ainda é um prompt sem arquivo —
 * e a janela poderia abrir sobre a única imagem boa que existe.
 *
 * ==================== O MODO DE FALHA É GUARDAR DEMAIS ====================
 *
 * Se qualquer passo falhar, **o predecessor continua atual**. Nenhum caminho
 * aqui compensa uma falha apagando ativo válido: isso trocaria limpeza adiada
 * por perda de trabalho. Falhou é falhou, e a imagem antiga segue no lugar.
 *
 * ==================== ANTES DA M3 ESTE MÓDULO É INERTE ====================
 *
 * `anchor_kind`, `anchor_ref`, `replaced_by_asset_id`, `superseded_at` e
 * `purge_after` em `writer_media_assets`, mais a RPC `writer_replace_media_asset`,
 * só existem depois da M3. Enquanto ela não for aplicada, a capacidade é
 * detectada como ausente e tudo devolve `unavailable` — sem erro, sem log de
 * pânico e sem mudar o que o Redator faz hoje.
 */

import "server-only";
import { getOperationalClient } from "./editorial-db";

/*
 * As REGRAS moram em `lib/redator/media-anchor.ts` — puras, sem `server-only`,
 * exercitáveis sem banco. Este módulo é o I/O que as obedece.
 */
export {
  MEDIA_ANCHOR_KINDS, BREATH_BLOCKED, isMediaAnchorKind, coverAnchor, sameAnchor,
  planMediaReplacement, mediaFileConfirmed, predecessorRetention, newMediaBriefAnchorState,
  RECOVERY_WINDOW_HOURS, recoveryWindowEnd,
} from "../redator/media-anchor.ts";
export type { MediaAnchor, MediaAnchorKind, MediaAssetState, ReplacementPlan, ReplacementRefusal } from "../redator/media-anchor.ts";

import { mediaFileConfirmed, planMediaReplacement, sameAnchor, type MediaAnchor, type MediaAssetState, type ReplacementRefusal } from "../redator/media-anchor.ts";

/** O que a leitura traz além do estado que as regras puras avaliam. */
type MediaAssetRow = MediaAssetState & { replacedByAssetId: string | null };

/* ==========================================================================
 * DETECÇÃO DE CAPACIDADE — o código precisa atravessar a fronteira da M3
 * ========================================================================== */

type Capability = { anchorColumns: boolean; checkedAt: number };
let cache: Capability | null = null;
/** Curto de propósito: a M3 pode ser aplicada com o processo no ar. */
const CAPABILITY_TTL_MS = 60_000;

/** Só para teste: descarta a detecção em cache. */
export function resetWriterMediaAnchorCapability() { cache = null; }

/**
 * `anchor_kind` em `writer_media_assets` é o marcador da M3.
 *
 * A M3 cria as colunas, o índice único e a RPC na MESMA transação, então a
 * presença da coluna implica a presença do resto. Detectar pela coluna é uma
 * leitura barata; detectar pela RPC exigiria chamá-la, e chamar para descobrir
 * se existe é o tipo de sonda que um dia escreve.
 */
export async function writerMediaAnchorAvailable(): Promise<boolean> {
  if (cache && Date.now() - cache.checkedAt < CAPABILITY_TTL_MS) return cache.anchorColumns;
  const probe = await getOperationalClient().from("writer_media_assets").select("anchor_kind").limit(1);
  const ausente = Boolean(probe.error) && (probe.error?.code === "42703"
    || /anchor_kind/i.test(probe.error?.message || ""));
  /*
   * Erro que NÃO é de coluna ausente (rede, permissão) não vira "indisponível"
   * em cache: seria transformar falha passageira em desativação silenciosa.
   */
  if (probe.error && !ausente) return false;
  cache = { anchorColumns: !ausente, checkedAt: Date.now() };
  return cache.anchorColumns;
}

/* ==========================================================================
 * LEITURA DO ESTADO — do servidor, nunca do cliente
 * ========================================================================== */

const CAMPOS_COM_ANCHOR = "id,marca_id,document_id,deliverable_id,status,storage_path,file_hash,anchor_kind,anchor_ref,superseded_at,replaced_by_asset_id";

/**
 * Lê um ativo já ESCOPADO pela marca.
 *
 * O `assetId` chega do cliente e por isso não é autoridade nenhuma: ele é um
 * ponteiro que só resolve dentro da marca que o servidor já validou. Um id de
 * outra marca simplesmente não encontra linha.
 */
async function readAssetState(brandId: string, assetId: string): Promise<MediaAssetRow | null> {
  const { data, error } = await getOperationalClient().from("writer_media_assets")
    .select(CAMPOS_COM_ANCHOR).eq("id", assetId).eq("marca_id", brandId).maybeSingle();
  if (error || !data) return null;
  const linha = data as Record<string, unknown>;
  const kind = linha.anchor_kind as MediaAnchor["kind"] | null;
  const ref = linha.anchor_ref as string | null;
  return {
    assetId: String(linha.id),
    brandId: String(linha.marca_id),
    documentId: String(linha.document_id),
    deliverableId: (linha.deliverable_id as string | null) ?? null,
    status: linha.status as MediaAssetState["status"],
    storagePath: (linha.storage_path as string | null) ?? null,
    fileHash: (linha.file_hash as string | null) ?? null,
    anchor: kind && ref ? { kind, ref } : null,
    supersededAt: (linha.superseded_at as string | null) ?? null,
    replacedByAssetId: (linha.replaced_by_asset_id as string | null) ?? null,
  };
}

/* ==========================================================================
 * A SUBSTITUIÇÃO
 * ========================================================================== */

export type ReplacementOutcome =
  | { status: "unavailable" }
  | { status: "not_found"; which: "predecessor" | "successor" }
  | { status: "refused"; refusal: ReplacementRefusal }
  | { status: "failed"; reason: string }
  | { status: "readback_failed"; reason: string }
  | { status: "replaced"; anchor: MediaAnchor; successorAssetId: string; predecessorAssetId: string;
      supersededAt: string; purgeAfter: string };

/**
 * ===== A TROCA ATÔMICA =====
 *
 * A atomicidade é da RPC `writer_replace_media_asset`, SECURITY DEFINER, numa
 * transação só: o predecessor perde a âncora e recebe `superseded_at`,
 * `replaced_by_asset_id` e `purge_after` enquanto o sucessor recebe a âncora.
 *
 * Fazer isso em dois UPDATEs daqui deixaria uma janela em que a posição não tem
 * dono — ou pior, em que os dois a reivindicam. O índice único parcial da M3
 * recusaria o segundo, e sobraria um predecessor sem âncora e um sucessor sem
 * âncora: a imagem sumiria da tela sem ninguém ter apagado nada.
 *
 * As sete validações rodam DUAS vezes: aqui, contra o estado lido do servidor,
 * para devolver diagnóstico específico; e dentro da RPC, que é quem decide de
 * verdade sob lock. A daqui é para quem lê o erro. A de lá é a que vale.
 */
export async function replaceWriterMediaAsset(input: {
  brandId: string;
  predecessorAssetId: string;
  successorAssetId: string;
  actorId: string;
}): Promise<ReplacementOutcome> {
  if (!(await writerMediaAnchorAvailable())) return { status: "unavailable" };

  const predecessor = await readAssetState(input.brandId, input.predecessorAssetId);
  if (!predecessor) return { status: "not_found", which: "predecessor" };
  const successor = await readAssetState(input.brandId, input.successorAssetId);
  if (!successor) return { status: "not_found", which: "successor" };

  const plano = planMediaReplacement({ predecessor, successor, brandId: input.brandId });
  if (!plano.allowed) return { status: "refused", refusal: plano.refusal };

  const { data, error } = await getOperationalClient().rpc("writer_replace_media_asset", {
    p_brand_id: input.brandId,
    p_old_asset_id: input.predecessorAssetId,
    p_new_asset_id: input.successorAssetId,
    p_actor_id: input.actorId,
  });
  if (error) return { status: "failed", reason: error.code || error.message || "rpc_failed" };
  if (!data) return { status: "failed", reason: "rpc_sem_recibo" };

  /*
   * ===== O READBACK É O QUE AUTORIZA A JANELA =====
   *
   * O recibo da RPC diz o que ela ACHA que gravou. A janela de 48h só é
   * legítima depois de reler do servidor e confirmar que o sucessor está com a
   * âncora que era do predecessor e que o predecessor saiu do posto.
   *
   * O predecessor MANTÉM `anchor_kind`/`anchor_ref` — é o registro de onde ele
   * vivia, e é o que torna a recuperação dentro das 48h possível. Quem o tira
   * do posto é `superseded_at`, que o remove do índice único parcial. Exigir
   * aqui que ele tivesse perdido a âncora reprovaria toda substituição bem
   * sucedida como `readback_failed`.
   */
  const sucessorRelido = await readAssetState(input.brandId, input.successorAssetId);
  const predecessorRelido = await readAssetState(input.brandId, input.predecessorAssetId);
  if (!sucessorRelido || !predecessorRelido) return { status: "readback_failed", reason: "ativo_sumiu_no_readback" };
  if (!sucessorRelido.anchor) return { status: "readback_failed", reason: "sucessor_sem_ancora" };
  if (!predecessorRelido.supersededAt) return { status: "readback_failed", reason: "predecessor_sem_superseded_at" };
  /* A posição precisa ser a MESMA: o sucessor assumiu o posto, não outro. */
  if (!sameAnchor(sucessorRelido.anchor, plano.anchor)) {
    return { status: "readback_failed", reason: "sucessor_em_outra_ancora" };
  }
  /* E o predecessor precisa declarar por quem foi substituído. */
  if (predecessorRelido.replacedByAssetId !== sucessorRelido.assetId) {
    return { status: "readback_failed", reason: "predecessor_sem_sucessor_declarado" };
  }

  const recibo = data as Record<string, unknown>;
  const purgeAfter = String(recibo.purgeAfter ?? recibo.purge_after ?? "");
  if (!purgeAfter) return { status: "readback_failed", reason: "recibo_sem_purge_after" };

  return {
    status: "replaced",
    anchor: sucessorRelido.anchor,
    successorAssetId: sucessorRelido.assetId,
    predecessorAssetId: predecessorRelido.assetId,
    supersededAt: predecessorRelido.supersededAt,
    purgeAfter,
  };
}

/* ==========================================================================
 * PREVIEW — bucket privado, URL assinada de curta duração
 * ========================================================================== */

/**
 * ===== VER A IMAGEM SEM ABRIR O BUCKET =====
 *
 * `writer-media` é privado, e continua privado. Tornar o bucket público para
 * que o painel mostre a imagem exporia todo o acervo editorial de todas as
 * marcas a quem descobrisse um caminho — e os caminhos são previsíveis, porque
 * contêm o id da marca e o hash do documento.
 *
 * Também não se manda token bruto ao navegador: a service key assina QUALQUER
 * coisa neste projeto, e ela nunca sai do servidor.
 *
 * O que sai é uma URL assinada de **60 segundos**, emitida depois de o servidor
 * ter confirmado a sessão, a permissão na marca e que o ativo pertence àquela
 * marca. Curta de propósito: ela vale para pintar a imagem agora, não para ser
 * guardada, compartilhada ou colada em outro lugar.
 */
export const PREVIEW_URL_TTL_SECONDS = 60;

export type PreviewOutcome =
  | { status: "unavailable" }
  | { status: "not_found" }
  | { status: "no_file" }
  | { status: "failed"; reason: string }
  | { status: "signed"; url: string; expiresInSeconds: number };

export async function signWriterMediaPreview(input: {
  brandId: string;
  assetId: string;
}): Promise<PreviewOutcome> {
  if (!(await writerMediaAnchorAvailable())) return { status: "unavailable" };

  /*
   * O caminho do arquivo vem do BANCO, escopado pela marca — nunca do cliente.
   * Um caminho vindo da requisição deixaria assinar qualquer objeto do bucket,
   * inclusive de outra marca.
   */
  const asset = await readAssetState(input.brandId, input.assetId);
  if (!asset) return { status: "not_found" };
  if (!asset.storagePath) return { status: "no_file" };

  const { data, error } = await getOperationalClient().storage
    .from("writer-media").createSignedUrl(asset.storagePath, PREVIEW_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return { status: "failed", reason: error?.message || "sign_failed" };
  return { status: "signed", url: data.signedUrl, expiresInSeconds: PREVIEW_URL_TTL_SECONDS };
}

/* ==========================================================================
 * EDIÇÃO DO BRIEFING — alt text, objetivo e prompt
 * ========================================================================== */

export type BriefUpdateOutcome =
  | { status: "unavailable" }
  | { status: "not_found" }
  | { status: "refused"; refusal: "superseded" }
  | { status: "failed"; reason: string }
  | { status: "updated"; assetId: string; altText: string; objective: string; prompt: string };

/**
 * Texto alternativo é acessibilidade, e muda depois de a imagem existir — por
 * isso é editável no ativo ATUAL, não só no briefing. O que não se edita é o
 * arquivo: trocar imagem é substituição, com sucessor e janela.
 *
 * Ativo em janela de retenção é histórico e não se reescreve.
 */
export async function updateWriterMediaBrief(input: {
  brandId: string;
  assetId: string;
  altText?: string;
  objective?: string;
  prompt?: string;
  actorId: string;
}): Promise<BriefUpdateOutcome> {
  if (!(await writerMediaAnchorAvailable())) return { status: "unavailable" };

  const asset = await readAssetState(input.brandId, input.assetId);
  if (!asset) return { status: "not_found" };
  if (asset.supersededAt) return { status: "refused", refusal: "superseded" };

  const campos: Record<string, string> = { updated_by: input.actorId };
  if (input.altText !== undefined) campos.alt_text = input.altText;
  if (input.objective !== undefined) campos.objective = input.objective;
  if (input.prompt !== undefined) campos.prompt = input.prompt;

  const { data, error } = await getOperationalClient().from("writer_media_assets")
    .update(campos).eq("id", input.assetId).eq("marca_id", input.brandId)
    .is("superseded_at", null)
    .select("id,alt_text,objective,prompt").maybeSingle();
  if (error) return { status: "failed", reason: error.code || error.message || "update_failed" };
  if (!data) return { status: "failed", reason: "sem_readback" };

  const lido = data as Record<string, unknown>;
  /* Readback: o que voltou tem que ser o que se pediu. */
  if (input.altText !== undefined && lido.alt_text !== input.altText) {
    return { status: "failed", reason: "readback_divergente" };
  }
  return {
    status: "updated", assetId: String(lido.id),
    altText: String(lido.alt_text ?? ""), objective: String(lido.objective ?? ""), prompt: String(lido.prompt ?? ""),
  };
}

/* ==========================================================================
 * PRIMEIRA ANCORAGEM — quando a posição ainda está vazia
 * ========================================================================== */

export type AnchorOutcome =
  | { status: "unavailable" }
  | { status: "not_found" }
  | { status: "refused"; refusal: "file_unconfirmed" | "already_anchored" | "anchor_taken" }
  | { status: "failed"; reason: string }
  | { status: "anchored"; anchor: MediaAnchor; assetId: string };

/**
 * Ancorar um ativo numa posição LIVRE.
 *
 * Isto não é substituição e não abre janela nenhuma: não há predecessor. Existe
 * porque a primeira imagem de um bloco precisa entrar de algum jeito, e usar o
 * caminho de substituição com um predecessor inventado seria mentira.
 *
 * A posição estar livre é decidida pelo índice único parcial da M3, não por uma
 * leitura anterior — entre a leitura e o UPDATE cabe outra requisição. Colisão
 * volta como `anchor_taken`, e quem quer aquela posição tem que substituir.
 */
export async function anchorWriterMediaAsset(input: {
  brandId: string;
  assetId: string;
  anchor: MediaAnchor;
  actorId: string;
}): Promise<AnchorOutcome> {
  if (!(await writerMediaAnchorAvailable())) return { status: "unavailable" };

  const asset = await readAssetState(input.brandId, input.assetId);
  if (!asset) return { status: "not_found" };
  if (asset.anchor) return { status: "refused", refusal: "already_anchored" };
  if (!mediaFileConfirmed(asset)) return { status: "refused", refusal: "file_unconfirmed" };

  const { data, error } = await getOperationalClient().from("writer_media_assets")
    .update({ anchor_kind: input.anchor.kind, anchor_ref: input.anchor.ref, updated_by: input.actorId })
    .eq("id", input.assetId).eq("marca_id", input.brandId)
    /* Guarda otimista: só ancora quem ainda não tem âncora. */
    .is("anchor_kind", null).is("superseded_at", null)
    .select("id,anchor_kind,anchor_ref").maybeSingle();

  if (error) {
    /* 23505 é o índice único parcial: a posição já tem dono. */
    if (error.code === "23505") return { status: "refused", refusal: "anchor_taken" };
    return { status: "failed", reason: error.code || error.message || "update_failed" };
  }
  if (!data) return { status: "failed", reason: "sem_readback" };
  const relido = data as Record<string, unknown>;
  if (relido.anchor_kind !== input.anchor.kind || relido.anchor_ref !== input.anchor.ref) {
    return { status: "failed", reason: "readback_divergente" };
  }
  return { status: "anchored", anchor: input.anchor, assetId: String(relido.id) };
}
