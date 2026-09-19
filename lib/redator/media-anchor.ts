/**
 * ===== A ÂNCORA DA MÍDIA, E AS REGRAS DA SUBSTITUIÇÃO =====
 *
 * Sem `server-only`: aqui não há I/O. São regras puras, exercitáveis por teste
 * sem banco e sem Storage — o mesmo desenho de `version-lifecycle.ts`, e pelo
 * mesmo motivo: a decisão precisa ser auditável separada da execução.
 *
 * ==================== O DEFEITO QUE ISTO FECHA ====================
 *
 * Hoje a única saída para trocar uma imagem é o 409 `asset_already_uploaded`,
 * que manda "criar outro briefing". O briefing novo nasce sem vínculo nenhum
 * com a POSIÇÃO que o antigo ocupava. O resultado é um ativo órfão e uma posição
 * que continua com a imagem velha — ou com nenhuma.
 *
 * O problema nunca foi sobrescrita. Era o contrário: nada é sobrescrito, e por
 * isso nada é substituído.
 *
 * ==================== A AUTORIDADE MORA NO REDATOR ====================
 *
 * O vínculo é `writer_media_assets.anchor_kind` + `anchor_ref`. Ele NÃO vai para
 * o ArticleDNA, o SiloDNA ou qualquer contrato do Arquiteto: a imagem é decisão
 * editorial do Redator, e o DNA não pode passar a depender de um ativo que nasce
 * e morre no ciclo de produção.
 *
 * ==================== A ORDEM É A REGRA ====================
 *
 *   registrar sucessor SEM âncora
 *   → upload
 *   → validar formato/hash
 *   → readback do Storage
 *   → substituição atômica
 *   → predecessor perde a posição
 *   → sucessor recebe a âncora
 *   → readback
 *   → só então o predecessor entra na janela de 48h
 *
 * A âncora é o ÚLTIMO passo, não o primeiro. Atribuí-la no briefing criaria
 * duas linhas disputando a mesma posição enquanto a segunda ainda é só um
 * prompt sem arquivo — e a janela de retenção poderia abrir sobre a única
 * imagem boa que existe.
 */

/* Extensão explícita: o runner roda estes módulos como ESM, sem bundler. */
import { RECOVERY_WINDOW_HOURS, recoveryWindowEnd } from "./version-lifecycle.ts";

export { RECOVERY_WINDOW_HOURS, recoveryWindowEnd };

/**
 * Onde uma imagem pode morar.
 *
 * `article_cover` ancora no próprio `documentId`: a capa é uma por documento e
 * não tem entidade própria no contrato. O índice único parcial da M3, sobre
 * `(marca_id, document_id, anchor_kind, anchor_ref)`, garante que continue uma.
 *
 * `article_break` (respiro) está DELIBERADAMENTE fora — ver `BREATH_BLOCKED`.
 */
export const MEDIA_ANCHOR_KINDS = ["article_cover", "article_block", "script_scene", "carousel_slide"] as const;

/* ==========================================================================
 * CORTE 6A.7 · DE QUEM É ESTA MÍDIA
 *
 * `writer_media_assets.deliverable_id` está NULL em todos os ativos, e esta
 * rodada não o preenche. Não precisa: a identidade já é garantida pelo banco.
 *
 *   UNIQUE (document_id, kind)               em writer_deliverables
 *   CHECK  kind IN ('video_script','carousel')
 *
 * E o mapa abaixo é TOTAL e FIXO — cena só existe em roteiro, slide só existe em
 * carrossel. Logo (document_id, kind) resolve exatamente um entregável. Isso não
 * é heurística: é a mesma relação que a tela já usa para carregar o entregável
 * da aba aberta.
 *
 * `article_cover` e `article_block` devolvem `null` de propósito: o artigo
 * tem lifecycle próprio e não é assunto desta guarda.
 * ========================================================================== */

export type DeliverableKindForMedia = "video_script" | "carousel";

/** A âncora, quando já existe. */
export const DELIVERABLE_KIND_BY_ANCHOR: Readonly<Record<string, DeliverableKindForMedia>> = {
  script_scene: "video_script",
  carousel_slide: "carousel",
};

/** O papel do briefing, que existe ANTES da âncora. */
export const DELIVERABLE_KIND_BY_ROLE: Readonly<Record<string, DeliverableKindForMedia>> = {
  storyboard: "video_script",
  slide: "carousel",
};

/**
 * A âncora manda quando existe; o papel resolve enquanto ela não existe. É o que
 * permite a mesma guarda valer no briefing, no upload e na ancoragem.
 */
export function deliverableKindForMedia(input: {
  role?: string | null;
  anchorKind?: string | null;
}): DeliverableKindForMedia | null {
  if (input.anchorKind && DELIVERABLE_KIND_BY_ANCHOR[input.anchorKind]) {
    return DELIVERABLE_KIND_BY_ANCHOR[input.anchorKind];
  }
  if (input.role && DELIVERABLE_KIND_BY_ROLE[input.role]) return DELIVERABLE_KIND_BY_ROLE[input.role];
  return null;
}

export type MediaMutationGate =
  | { allowed: true }
  | { allowed: false; refusal: "writer_deliverable_finalized" };

/**
 * ===== LER PODE SEMPRE; ALTERAR, NÃO =====
 *
 * Só `approved` recusa. `draft` e `in_review` seguem, e um entregável
 * que ainda não existe também — a mídia pode nascer antes dele.
 */
export function gateMediaMutation(input: {
  deliverableKind: DeliverableKindForMedia | null;
  deliverableStatus: string | null;
}): MediaMutationGate {
  if (!input.deliverableKind) return { allowed: true };
  if (input.deliverableStatus !== "approved") return { allowed: true };
  return { allowed: false, refusal: "writer_deliverable_finalized" };
}
export type MediaAnchorKind = (typeof MEDIA_ANCHOR_KINDS)[number];

/**
 * O respiro não tem identidade estável e por isso não tem âncora.
 *
 * Não existe bloco de respiro em `ContentBlockSchema`, e `metadata.plannedImages`
 * é lista de strings soltas. Ancorá-lo exigiria alterar contrato do Arquiteto —
 * proibido — ou inventar "depois do bloco X", que migra o respiro de lugar em
 * silêncio no dia em que X for apagado.
 *
 * O papel `breath` continua existindo como briefing. O que ele não ganha é
 * substituição atômica, porque não há posição para transferir.
 */
export const BREATH_BLOCKED = {
  role: "breath",
  motivo: "sem identidade estável: não há bloco de respiro no ContentBlockSchema",
} as const;

export type MediaAnchor = { kind: MediaAnchorKind; ref: string };

export function isMediaAnchorKind(value: unknown): value is MediaAnchorKind {
  return typeof value === "string" && (MEDIA_ANCHOR_KINDS as readonly string[]).includes(value);
}

/** A capa ancora no documento. Uma função para que a convenção tenha um dono. */
export function coverAnchor(documentId: string): MediaAnchor {
  return { kind: "article_cover", ref: documentId };
}

export function sameAnchor(a: MediaAnchor | null, b: MediaAnchor | null): boolean {
  if (!a || !b) return false;
  return a.kind === b.kind && a.ref === b.ref;
}

/**
 * O estado de um ativo, do ponto de vista da substituição.
 *
 * É o mínimo que a decisão precisa — não a linha inteira do banco. O que não
 * entra aqui não pode influenciar a decisão, e isso é proposital.
 */
export type MediaAssetState = {
  assetId: string;
  brandId: string;
  documentId: string;
  deliverableId: string | null;
  status: "prompt_ready" | "uploaded" | "reviewed";
  storagePath: string | null;
  fileHash: string | null;
  anchor: MediaAnchor | null;
  supersededAt: string | null;
};

/**
 * Por que uma substituição foi recusada.
 *
 * Nomes específicos, e não um `false` genérico: quem lê o log precisa saber
 * qual das sete validações barrou, sem reproduzir o estado.
 */
export type ReplacementRefusal =
  | "same_asset"
  | "brand_mismatch"
  | "document_mismatch"
  | "deliverable_mismatch"
  | "predecessor_without_anchor"
  | "predecessor_not_current"
  | "anchor_divergent"
  | "successor_file_unconfirmed"
  | "successor_already_superseded";

export type ReplacementPlan =
  | { allowed: true; anchor: MediaAnchor }
  | { allowed: false; refusal: ReplacementRefusal };

/**
 * ===== AS SETE VALIDAÇÕES, ANTES DE QUALQUER I/O =====
 *
 * A ordem importa para o diagnóstico: identidade e escopo primeiro (erros de
 * quem chamou), estado depois (erros de fluxo). Quem recebe `brand_mismatch`
 * tem um problema diferente de quem recebe `successor_file_unconfirmed`.
 *
 * `predecessor_not_current` é a garantia de que a troca não passa por cima de
 * uma substituição que já aconteceu: um predecessor já superseded perdeu a
 * posição, e reivindicá-la de novo criaria duas correntes para a mesma âncora.
 */
export function planMediaReplacement(input: {
  predecessor: MediaAssetState;
  successor: MediaAssetState;
  /** A marca do chamador, validada pelo servidor — nunca vinda do cliente. */
  brandId: string;
}): ReplacementPlan {
  const { predecessor, successor, brandId } = input;

  if (predecessor.assetId === successor.assetId) return { allowed: false, refusal: "same_asset" };

  if (predecessor.brandId !== brandId || successor.brandId !== brandId) {
    return { allowed: false, refusal: "brand_mismatch" };
  }
  if (predecessor.documentId !== successor.documentId) {
    return { allowed: false, refusal: "document_mismatch" };
  }
  if ((predecessor.deliverableId ?? null) !== (successor.deliverableId ?? null)) {
    return { allowed: false, refusal: "deliverable_mismatch" };
  }

  if (!predecessor.anchor) return { allowed: false, refusal: "predecessor_without_anchor" };
  if (predecessor.supersededAt) return { allowed: false, refusal: "predecessor_not_current" };

  /*
   * O sucessor pode chegar sem âncora — é o caso normal, e ele HERDA a do
   * predecessor. Se chegar com âncora, ela tem que ser a mesma: aceitar outra
   * transformaria "substituir" em "mover", que é operação diferente e não foi
   * pedida nem validada aqui.
   */
  if (successor.anchor && !sameAnchor(successor.anchor, predecessor.anchor)) {
    return { allowed: false, refusal: "anchor_divergent" };
  }

  if (!mediaFileConfirmed(successor)) return { allowed: false, refusal: "successor_file_unconfirmed" };
  if (successor.supersededAt) return { allowed: false, refusal: "successor_already_superseded" };

  return { allowed: true, anchor: predecessor.anchor };
}

/**
 * Arquivo confirmado = os três juntos.
 *
 * `status` sozinho não basta: ele é texto, e o CHECK do banco só vale no banco.
 * Aqui a pergunta é se existe arquivo COM prova — caminho e hash —, porque é o
 * hash que o readback do Storage conferiu.
 */
export function mediaFileConfirmed(asset: Pick<MediaAssetState, "status" | "storagePath" | "fileHash">): boolean {
  if (asset.status !== "uploaded" && asset.status !== "reviewed") return false;
  return Boolean(asset.storagePath) && Boolean(asset.fileHash);
}

/**
 * O que acontece com o predecessor DEPOIS da troca confirmada.
 *
 * Separado de `planMediaReplacement` de propósito: a janela só é calculada
 * quando a troca já aconteceu e foi relida. Calcular antes convidaria a gravar
 * `purge_after` numa linha que ainda é a única cópia boa.
 */
export function predecessorRetention(input: { supersededAt: string; successorAssetId: string }) {
  return {
    supersededAt: input.supersededAt,
    replacedByAssetId: input.successorAssetId,
    purgeAfter: recoveryWindowEnd(input.supersededAt),
  };
}

/**
 * O briefing nasce SEM âncora. Esta função existe para que isso seja um fato
 * do código, e não uma promessa de comentário.
 */
export function newMediaBriefAnchorState(): { anchorKind: null; anchorRef: null } {
  return { anchorKind: null, anchorRef: null };
}
