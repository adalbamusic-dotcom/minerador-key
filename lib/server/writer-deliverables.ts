import "server-only";
import { createHash } from "node:crypto";
import { ContentBlockSchema, ContentDocumentSchema } from "../arquiteto/contracts.ts";
import { canonicalJson, contentHash } from "../arquiteto/versioning.ts";
import { WriterDeliverablePayloadSchema, WriterMediaBriefSchema, type WriterDeliverablePayload } from "../redator/multiformat-contracts.ts";
import { getOperationalClient, mapPersistenceError, OptimisticLockError } from "./editorial-db";
import { markDeliverablePredecessorSuperseded, writerRetentionAvailable } from "./writer-retention";
import {
  finalizationDecisionFromReceipt, planRetentionAfterFinalization,
  verifyFinalizationReadback, verifyReopenReadback,
} from "../redator/deliverable-lifecycle.ts";
import { writerMediaAnchorAvailable } from "./writer-media-lifecycle";
import { checkAssetTargetEditable, checkMediaTargetEditable, MENSAGEM_ENTREGAVEL_FINALIZADO } from "./writer-media-guard";

export class WriterDeliverableError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}

type DocumentRow = { id: string; marca_id: string; content_hash: string };

async function documentForBrand(brandId: string, documentId: string): Promise<DocumentRow> {
  const { data, error } = await getOperationalClient().from("content_documents")
    .select("id,marca_id,content_hash").eq("id", documentId).eq("marca_id", brandId).maybeSingle();
  if (error) mapPersistenceError(error);
  if (!data) throw new WriterDeliverableError("document_not_found", "Documento não encontrado nesta marca.", 404);
  return data;
}

export async function writerSourceHash(brandId: string, documentId: string) {
  return (await documentForBrand(brandId, documentId)).content_hash;
}

export async function saveWriterArticleDraft(input: { brandId: string; documentId: string; expectedLockVersion: number; blocks: unknown; actorId: string }) {
  const blocks = ContentBlockSchema.array().max(500).parse(input.blocks);
  const client = getOperationalClient();
  /*
   * ===== O `before` CONTINUA INTEIRO, PORQUE O HASH EXIGE =====
   *
   * Fase 0 da SDD do leitor de evidências. Esta é a única leitura do payload
   * inteiro que sobra no save, e não por descuido:
   *
   *   1. `content_hash` é `contentHash(next)`, SHA-256 do JSON canônico do
   *      documento INTEIRO (lib/arquiteto/versioning.ts). Sem o dossiê não há
   *      como calcular o mesmo hash.
   *   2. A RPC recebe o documento inteiro e recusa com
   *      `writer_draft_scope_invalid` se, tirando blocks, editorContent e
   *      status, ele diferir do gravado (M6). É o que prova que o MCP só mexeu
   *      no que podia.
   *
   * Medido em 2026-09-23: 4.502.936 B por save no documento GOOGLE. Tirar isto
   * exige hash e comparação no banco, ou o dossiê fora do payload (Fase 2):
   * mudança estrutural, com SDD própria. O readback abaixo é que ficou estreito.
   */
  const before = await client.from("content_documents")
    .select("id,payload,lock_version").eq("id", input.documentId).eq("marca_id", input.brandId).maybeSingle();
  if (before.error) mapPersistenceError(before.error);
  if (!before.data) throw new WriterDeliverableError("document_not_found", "Documento não encontrado nesta marca.", 404);
  const current = ContentDocumentSchema.parse(before.data.payload);
  if (current.status === "aprovado") throw new WriterDeliverableError("approved_immutable", "Documento aprovado não pode ser alterado pelo MCP.", 409);
  const next = ContentDocumentSchema.parse({ ...current, blocks, editorContent: null, status: "escrevendo" });
  const hash = await contentHash(next);
  const { data, error } = await client.rpc("writer_save_article_draft", {
    p_brand_id: input.brandId, p_document_id: input.documentId, p_payload: next,
    p_content_hash: hash, p_expected_lock: input.expectedLockVersion, p_actor_id: input.actorId,
  });
  if (error) {
    if (error.message.includes("writer_lock_conflict")) throw new OptimisticLockError();
    if (error.message.includes("writer_approved_immutable")) throw new WriterDeliverableError("approved_immutable", "Documento aprovado não pode ser alterado pelo MCP.", 409);
    if (error.message.includes("writer_draft_scope_invalid")) throw new WriterDeliverableError("draft_scope_invalid", "O documento mudou ou o rascunho tentou alterar campos protegidos.", 409);
    mapPersistenceError(error);
  }
  const receipt = data as { id?: string; contentHash?: string; lockVersion?: number; versionId?: string; unchanged?: boolean } | null;
  if (!receipt?.id || receipt.contentHash !== hash) throw new WriterDeliverableError("readback_failed", "Gravação sem recibo remoto coerente.", 502);
  /*
   * ===== READBACK POR CAMINHO =====
   *
   * Lê só o que confere: hash, lock, ponteiro e os blocos. Medido em
   * 2026-09-23: ~1,2 kB no documento GOOGLE, contra 4,5 MB do payload inteiro.
   *
   * O que saiu foi só a revalidação do documento inteiro na volta, e ela não
   * provava nada novo: o hash cobre o documento inteiro, a RPC grava `payload`
   * e `content_hash` no mesmo UPDATE, e o hash foi calculado aqui sobre o
   * `next` já validado pelo schema. Hash igual prova que a linha é a que este
   * save gravou (ou uma idêntica); os blocos conferem o que o cliente mandou,
   * como antes.
   */
  const readback = await client.from("content_documents").select("content_hash,lock_version,current_version_id,blocks:payload->blocks")
    .eq("id", input.documentId).eq("marca_id", input.brandId).maybeSingle();
  if (readback.error) mapPersistenceError(readback.error);
  /*
   * Depois da M6, `receipt.versionId` é a corrente que já existia — não uma
   * versão recém-criada. Comparar os dois deixou de significar "o servidor
   * gravou a versão que prometeu" e passou a significar algo mais forte: **o
   * save não mexeu no ponteiro**. Num documento nunca finalizado os dois são
   * nulos; com uma final existente, os dois são ela.
   */
  if (!readback.data || readback.data.content_hash !== hash || readback.data.lock_version !== receipt.lockVersion ||
      readback.data.current_version_id !== receipt.versionId ||
      canonicalJson(ContentBlockSchema.array().parse(readback.data.blocks)) !== canonicalJson(blocks)) {
    throw new WriterDeliverableError("readback_mismatch", "O rascunho salvo diverge da leitura remota.", 502);
  }
  /*
   * ===== M6 · SALVAR RASCUNHO PELO MCP NÃO CRIA HISTÓRICO NEM RETÉM =====
   *
   * Aqui havia uma chamada a `markArticlePredecessorSuperseded`. Ela fazia
   * sentido enquanto `writer_save_article_draft` inseria uma versão a cada save
   * alterado: a versão nova precisava empurrar a anterior para a janela de 48h.
   *
   * A M6 tirou o INSERT da RPC. Agora o save só atualiza o estado corrente,
   * `current_version_id` não se move, e o recibo devolve a corrente que JÁ
   * existia. Não há sucessora, logo não há predecessora a reter — e manter a
   * chamada seria pedir ao mecanismo de retenção que marcasse a predecessora de
   * uma versão que ninguém criou.
   *
   * Isso alinha o MCP ao caminho da TELA, que nunca versionou em save:
   * `createVersion` é false por padrão e só vira true em `requestStatus`, que é
   * o que o botão "Finalizar artigo" chama.
   *
   *   AUTOSAVE_CREATES_HISTORY = NO
   *   SAVE_DRAFT_CREATES_HISTORY = NO
   *   FINALIZATION_CREATES_HISTORY = YES
   *
   * A finalização do Artigo NÃO foi tocada: ela continua sendo
   * `ContentDocumentRepository.createVersion`, chamada pela rota da tela. O MCP
   * segue sem poder finalizar — a RPC exige `status = 'escrevendo'` no payload.
   */
  return { documentId: input.documentId, contentHash: hash, lockVersion: receipt.lockVersion,
    versionId: receipt.versionId, unchanged: receipt.unchanged === true };
}

export async function listWriterDeliverables(brandId: string, documentId: string) {
  await documentForBrand(brandId, documentId);
  const { data, error } = await getOperationalClient().from("writer_deliverables")
    .select("id,kind,status,payload,content_hash,lock_version,updated_at")
    .eq("marca_id", brandId).eq("document_id", documentId).order("updated_at", { ascending: false });
  if (error) mapPersistenceError(error);
  return (data || []).map(row => ({ id: row.id as string, kind: row.kind as string, status: row.status as string,
    payload: WriterDeliverablePayloadSchema.parse(row.payload), contentHash: row.content_hash as string,
    lockVersion: row.lock_version as number, updatedAt: row.updated_at as string }));
}

export async function saveWriterDeliverable(input: { brandId: string; documentId: string; payload: WriterDeliverablePayload; expectedLockVersion: number | null; actorId: string }) {
  const payload = WriterDeliverablePayloadSchema.parse(input.payload);
  if (payload.documentId !== input.documentId) throw new WriterDeliverableError("document_mismatch", "Entregável de outro documento.");
  const source = await documentForBrand(input.brandId, input.documentId);
  if (payload.sourceDocumentHash !== source.content_hash) throw new WriterDeliverableError("source_changed", "O artigo mudou; revise o entregável contra a versão atual.", 409);
  const client = getOperationalClient();
  const hash = await contentHash(payload);
  const { data, error } = await client.rpc("writer_save_deliverable", {
    p_brand_id: input.brandId, p_document_id: input.documentId, p_kind: payload.kind,
    p_payload: payload, p_content_hash: hash, p_expected_lock: input.expectedLockVersion,
    p_actor_id: input.actorId,
  });
  if (error) {
    if (error.message.includes("writer_lock_conflict")) throw new OptimisticLockError();
    if (error.message.includes("writer_approved_immutable")) throw new WriterDeliverableError("approved_immutable", "O entregável aprovado não pode ser sobrescrito.", 409);
    if (error.message.includes("writer_payload_invalid_or_stale")) throw new WriterDeliverableError("source_changed", "O artigo mudou; revise a origem do entregável.", 409);
    mapPersistenceError(error);
  }
  const result = data as { id?: string; contentHash?: string; lockVersion?: number; versionId?: string; versionNumber?: number; unchanged?: boolean } | null;
  if (!result?.id) throw new WriterDeliverableError("readback_failed", "Gravação sem recibo remoto.", 502);
  /*
   * ===== CORTE 3 · A COLUNA SÓ ENTRA NO SELECT DEPOIS DA M2 =====
   *
   * `writer_deliverables.current_version_id` não existe antes da migration.
   * Pedi-la ao PostgREST devolveria 42703 e derrubaria a gravação — código
   * preparado para a M2 não pode quebrar o runtime enquanto ela não chega.
   */
  const comColuna = await writerRetentionAvailable();
  const readback = comColuna
    ? await client.from("writer_deliverables").select("id,content_hash,lock_version,payload,current_version_id")
        .eq("id", result.id).eq("marca_id", input.brandId).eq("document_id", input.documentId).maybeSingle()
    : await client.from("writer_deliverables").select("id,content_hash,lock_version,payload")
        .eq("id", result.id).eq("marca_id", input.brandId).eq("document_id", input.documentId).maybeSingle();
  if (readback.error) mapPersistenceError(readback.error);
  const lido = readback.data as { content_hash: string; lock_version: number; payload: unknown; current_version_id?: string | null } | null;
  if (!lido || lido.content_hash !== hash || lido.lock_version !== result.lockVersion ||
      WriterDeliverablePayloadSchema.parse(lido.payload).kind !== payload.kind) {
    throw new WriterDeliverableError("readback_mismatch", "O entregável salvo diverge da leitura remota.", 502);
  }
  /*
   * Depois da M2, a corrente é a COLUNA — e o readback passa a conferi-la, como
   * o do artigo já faz. Antes dela, essa verificação não existe porque a coluna
   * não existe; `max(version_number)` não entra aqui como substituto, porque
   * deduzir a corrente é exatamente o que a M2 veio eliminar.
   */
  /*
   * ===== CORTE 6A.1 · O SAVE NÃO MOVE A CORRENTE, E ESTA LINHA PROVA =====
   *
   * Depois da M4 o recibo devolve `versionId` = a corrente que JÁ existia, não
   * uma versão recém-criada. Comparar os dois deixou de significar "o servidor
   * gravou a versão que prometeu" e passou a significar algo mais forte: **o
   * save não mexeu no ponteiro**. Num entregável nunca finalizado os dois são
   * nulos; depois de um reopen, os dois são a última final.
   */
  const currentVersionId = comColuna ? (lido.current_version_id ?? null) : null;
  if (comColuna && result.unchanged !== true && currentVersionId !== result.versionId) {
    throw new WriterDeliverableError("readback_mismatch", "A versão corrente do entregável diverge do recibo.", 502);
  }
  /*
   * ===== SALVAR RASCUNHO NUNCA INICIA RETENÇÃO =====
   *
   * Aqui havia uma chamada a `markDeliverablePredecessorSuperseded`. Ela fazia
   * sentido quando o save versionava; depois da M4 é defeito à espera de
   * acontecer:
   *
   *   FINAL_A → reopen → rascunho editado → save
   *
   * Nesse ponto `current_version_id` continua A, e o save passaria A como
   * "sucessor confirmado". A marcação então procuraria o predecessor de A e
   * abriria a janela de 48h sobre ele — por causa de um autosave, sem ninguém
   * ter finalizado nada.
   *
   * Retenção é ato EXCLUSIVO da finalização confirmada por readback, em
   * `finalizeWriterDeliverable`. O save devolve o recibo e para.
   */
  return result;
}

/* ==========================================================================
 * CORTE 6A.1 · FINALIZAR E REABRIR — A AUTORIDADE QUE FALTAVA
 *
 * Roteiro e carrossel usam as MESMAS duas funções. `kind` é parâmetro, não
 * ramo: duplicar por tipo criaria duas traduções da mesma recusa.
 *
 * O ator vem sempre do contexto autenticado do servidor. Nenhuma das duas
 * aceita `actorId` escolhido pelo navegador — quem chama é a rota, depois de
 * `requireCanonicalSessionProfile()`.
 * ========================================================================== */

export type WriterDeliverableKind = "video_script" | "carousel";

const MOTIVO_READBACK_FINALIZACAO: Record<string, string> = {
  not_found: "A finalização não voltou na leitura remota.",
  status_not_approved: "O entregável não ficou finalizado na leitura remota.",
  current_version_mismatch: "A versão corrente do entregável diverge do recibo da finalização.",
  hash_mismatch: "O conteúdo finalizado diverge da leitura remota.",
};

const MOTIVO_READBACK_REABERTURA: Record<string, string> = {
  not_found: "A reabertura não voltou na leitura remota.",
  status_not_draft: "O entregável não voltou para rascunho na leitura remota.",
  lost_last_final: "A reabertura perdeu a última versão finalizada.",
};

function erroDeFinalizacao(mensagem: string): never | void {
  if (mensagem.includes("writer_lock_conflict")) throw new OptimisticLockError();
  if (mensagem.includes("writer_deliverable_not_found")) {
    throw new WriterDeliverableError("deliverable_not_found", "Entregável não encontrado neste documento.", 404);
  }
  if (mensagem.includes("writer_finalized_state_inconsistent")) {
    throw new WriterDeliverableError("finalized_state_inconsistent",
      "O entregável está finalizado com conteúdo divergente da versão corrente. Reabra e revise antes de finalizar.", 409);
  }
  if (mensagem.includes("writer_predecessor_nao_e_final")) {
    throw new WriterDeliverableError("predecessor_not_final",
      "A versão corrente do entregável não é uma finalização canônica. Não é possível finalizar por cima dela.", 409);
  }
  if (mensagem.includes("writer_kind_invalid")) {
    throw new WriterDeliverableError("kind_invalid", "Tipo de entregável desconhecido.", 400);
  }
}

/**
 * ===== FINALIZAR — A ÚNICA PORTA QUE CRIA VERSÃO =====
 *
 * Ordem, e ela não é negociável:
 *
 *   RPC → recibo → READBACK → conferir → só então marcar o predecessor
 *
 * A decisão de marcar não mora aqui: `planRetentionAfterFinalization` é regra
 * pura, exercitada por teste sem banco. Este corpo é I/O e tradução de erro.
 *
 * Se a marcação falhar DEPOIS do readback confirmar a sucessora, a sucessora
 * continua corrente e o desfecho volta no campo `retention` — nunca se
 * compensa apagando a versão nova. Ficar retido por mais tempo é inofensivo;
 * perder a versão boa não é.
 */
export async function finalizeWriterDeliverable(input: {
  brandId: string; documentId: string; kind: WriterDeliverableKind;
  expectedLockVersion: number | null; actorId: string;
}) {
  await documentForBrand(input.brandId, input.documentId);
  const client = getOperationalClient();

  /*
   * ===== M5 · SEM PRÉ-CHECAGEM: A AUTORIDADE É DA RPC =====
   *
   * Aqui havia uma leitura prévia do entregável e da versão corrente só para
   * recusar `reopen → finalize sem editar` com 409, porque a RPC da M4
   * duplicaria a versão. A M5 resolveu isso no banco: hash igual ao da corrente
   * devolve o status a `approved` reusando a versão, com `unchanged: true`.
   *
   * A recusa saiu inteira, e as duas consultas extras foram junto. O wrapper
   * chama, lê de volta e confere — ele não decide mais o que a RPC vai fazer.
   */
  const { data, error } = await client.rpc("writer_finalize_deliverable", {
    p_brand_id: input.brandId, p_document_id: input.documentId, p_kind: input.kind,
    p_expected_lock: input.expectedLockVersion, p_actor_id: input.actorId,
  });
  if (error) { erroDeFinalizacao(error.message || ""); mapPersistenceError(error); }

  const receipt = data as {
    id?: string; versionId?: string | null; versionNumber?: number;
    previousVersionId?: string | null; contentHash?: string | null;
    lockVersion?: number; status?: string | null; unchanged?: boolean;
  } | null;
  if (!receipt?.id) throw new WriterDeliverableError("readback_failed", "Finalização sem recibo remoto.", 502);

  /* ---------- READBACK OBRIGATÓRIO ---------- */
  const leitura = await client.from("writer_deliverables")
    .select("id,status,content_hash,lock_version,current_version_id")
    .eq("id", receipt.id).eq("marca_id", input.brandId).eq("document_id", input.documentId).maybeSingle();
  if (leitura.error) mapPersistenceError(leitura.error);
  const lido = leitura.data as
    { status: string; content_hash: string; lock_version: number; current_version_id: string | null } | null;

  const conferencia = verifyFinalizationReadback({
    readback: lido
      ? { status: lido.status, currentVersionId: lido.current_version_id, contentHash: lido.content_hash }
      : null,
    receipt,
  });
  if (!conferencia.ok) {
    throw new WriterDeliverableError("readback_mismatch", MOTIVO_READBACK_FINALIZACAO[conferencia.reason], 502);
  }

  /*
   * ---------- SÓ AGORA: O PREDECESSOR ENTRA EM RETENÇÃO ----------
   *
   * Nos três caminhos da M5 esta decisão já está certa sem nenhum `if` novo:
   *
   *   A (primeira final)      create_version com previous NULL → no_predecessor
   *   B (reaberto sem mudar)  unchanged: true                  → unchanged_finalization
   *   C (reaberto com mudar)  create_version com previous A    → marca A
   *
   * O caminho B chega aqui como `unchanged` porque é isso que o recibo diz, e
   * `planRetentionAfterFinalization` recusa marcar quem não foi substituído.
   */
  const passo = planRetentionAfterFinalization({
    decision: finalizationDecisionFromReceipt(receipt),
    readbackCurrentVersionId: lido?.current_version_id ?? null,
    createdVersionId: receipt.versionId ?? null,
  });
  const retention = passo.mark
    ? await markDeliverablePredecessorSuperseded({
        brandId: input.brandId, deliverableId: receipt.id,
        successorVersionId: passo.successorVersionId,
        currentVersionId: lido?.current_version_id ?? null,
        unchanged: false,
      })
    : { status: "skipped" as const, reason: passo.reason };

  return {
    id: receipt.id, kind: input.kind,
    status: lido?.status ?? receipt.status ?? "approved",
    versionId: receipt.versionId ?? null,
    versionNumber: receipt.versionNumber ?? null,
    previousVersionId: receipt.previousVersionId ?? null,
    currentVersionId: lido?.current_version_id ?? null,
    contentHash: lido?.content_hash ?? receipt.contentHash ?? null,
    lockVersion: lido?.lock_version ?? receipt.lockVersion ?? null,
    unchanged: receipt.unchanged === true,
    retention,
  };
}

/**
 * ===== REABRIR — MUDA O STATUS, E SÓ =====
 *
 * Não cria versão, não inicia retenção, não toca `current_version_id`. A
 * última finalização continua sendo a corrente enquanto a próxima não existir,
 * e o readback confere justamente isso: ler de volta `draft` com a corrente
 * trocada seria pior do que um erro, seria uma perda silenciosa.
 */
export async function reopenWriterDeliverable(input: {
  brandId: string; documentId: string; kind: WriterDeliverableKind; actorId: string;
}) {
  await documentForBrand(input.brandId, input.documentId);
  const client = getOperationalClient();

  const antes = await client.from("writer_deliverables").select("id,status,current_version_id")
    .eq("marca_id", input.brandId).eq("document_id", input.documentId).eq("kind", input.kind).maybeSingle();
  if (antes.error) mapPersistenceError(antes.error);
  const anterior = antes.data as { id: string; status: string; current_version_id: string | null } | null;
  if (!anterior) throw new WriterDeliverableError("deliverable_not_found", "Entregável não encontrado neste documento.", 404);

  const { data, error } = await client.rpc("writer_reopen_deliverable", {
    p_brand_id: input.brandId, p_document_id: input.documentId, p_kind: input.kind, p_actor_id: input.actorId,
  });
  if (error) { erroDeFinalizacao(error.message || ""); mapPersistenceError(error); }
  const receipt = data as { id?: string; status?: string; lockVersion?: number; unchanged?: boolean } | null;
  if (!receipt?.id) throw new WriterDeliverableError("readback_failed", "Reabertura sem recibo remoto.", 502);

  const leitura = await client.from("writer_deliverables").select("id,status,lock_version,current_version_id")
    .eq("id", receipt.id).eq("marca_id", input.brandId).maybeSingle();
  if (leitura.error) mapPersistenceError(leitura.error);
  const lido = leitura.data as { status: string; lock_version: number; current_version_id: string | null } | null;

  const conferencia = verifyReopenReadback({
    readback: lido ? { status: lido.status, currentVersionId: lido.current_version_id } : null,
    currentVersionIdBefore: anterior.current_version_id,
  });
  if (!conferencia.ok) {
    throw new WriterDeliverableError("readback_mismatch", MOTIVO_READBACK_REABERTURA[conferencia.reason], 502);
  }

  return {
    id: receipt.id, kind: input.kind, status: lido?.status ?? "draft",
    currentVersionId: lido?.current_version_id ?? null,
    lockVersion: lido?.lock_version ?? receipt.lockVersion ?? null,
    unchanged: receipt.unchanged === true,
  };
}

const CAMPOS_MEDIA = "id,deliverable_id,role,status,objective,prompt,alt_text,aspect_ratio,storage_path,mime_type,file_hash,updated_at";

export async function listWriterMedia(brandId: string, documentId: string) {
  await documentForBrand(brandId, documentId);
  /*
   * PRÉ-M3 · as colunas de âncora só existem depois da M3. Pedir por elas antes
   * derrubaria a listagem inteira com 42703 — a tela de mídia sumiria por causa
   * de uma migration pendente. Com a capacidade ausente, a lista devolve o que
   * sempre devolveu e o painel de âncora simplesmente não tem o que mostrar.
   */
  const comAnchor = await writerMediaAnchorAvailable();
  const cliente = getOperationalClient();
  /*
   * Dois `await` explícitos em vez de `select(cond ? a : b)`: a união de
   * literais quebra a inferência do supabase-js e o retorno vira `never`.
   */
  const { data, error } = comAnchor
    ? await cliente.from("writer_media_assets")
        .select(`${CAMPOS_MEDIA},anchor_kind,anchor_ref,superseded_at,purge_after`)
        .eq("marca_id", brandId).eq("document_id", documentId).order("created_at", { ascending: true })
    : await cliente.from("writer_media_assets").select(CAMPOS_MEDIA)
        .eq("marca_id", brandId).eq("document_id", documentId).order("created_at", { ascending: true });
  if (error) mapPersistenceError(error);
  return data || [];
}

export async function registerWriterMediaBrief(input: unknown, actorId: string) {
  const brief = WriterMediaBriefSchema.parse(input);
  await documentForBrand(brief.brandId, brief.documentId);

  /*
   * ===== CORTE 6A.7 · ENTREGÁVEL FINALIZADO NÃO RECEBE MÍDIA NOVA =====
   *
   * O papel do briefing já diz de quem é a mídia antes de existir âncora:
   * o papel storyboard é de roteiro e o papel slide é de carrossel. É aqui que
   * começa, então é aqui que ela para.
   */
  const portao = await checkMediaTargetEditable({
    brandId: brief.brandId, documentId: brief.documentId, role: brief.role });
  if (!portao.editable) {
    throw new WriterDeliverableError("writer_deliverable_finalized", MENSAGEM_ENTREGAVEL_FINALIZADO, 409);
  }
  const { data, error } = await getOperationalClient().from("writer_media_assets").insert({
    marca_id: brief.brandId, document_id: brief.documentId, deliverable_id: brief.deliverableId,
    role: brief.role, status: "prompt_ready", objective: brief.objective, prompt: brief.prompt,
    alt_text: brief.altText, aspect_ratio: brief.aspectRatio, created_by: actorId, updated_by: actorId,
  }).select("id,status,prompt,updated_at").single();
  if (error) mapPersistenceError(error);
  if (!data) throw new WriterDeliverableError("readback_failed", "Não foi possível confirmar o prompt no banco.", 502);
  return data;
}

function verifiedImageMime(bytes: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function uploadWriterMediaAsset(input: { brandId: string; documentId: string; assetId: string; bytes: Buffer; actorId: string }) {
  await documentForBrand(input.brandId, input.documentId);

  /* Anexar bytes é mutação, e o ativo já existe: o veredito vem dele. */
  const portao = await checkAssetTargetEditable({ brandId: input.brandId, assetId: input.assetId });
  if (!portao.editable) {
    throw new WriterDeliverableError("writer_deliverable_finalized", MENSAGEM_ENTREGAVEL_FINALIZADO, 409);
  }
  if (!input.bytes.length || input.bytes.length > 10 * 1024 * 1024) throw new WriterDeliverableError("invalid_size", "Imagem deve ter até 10 MB.");
  const mime = verifiedImageMime(input.bytes);
  if (!mime) throw new WriterDeliverableError("invalid_image", "Formato de imagem não aceito.");
  const client = getOperationalClient();
  const { data: asset, error: lookupError } = await client.from("writer_media_assets")
    .select("id,status,storage_path").eq("id", input.assetId).eq("marca_id", input.brandId)
    .eq("document_id", input.documentId).maybeSingle();
  if (lookupError) mapPersistenceError(lookupError);
  if (!asset) throw new WriterDeliverableError("asset_not_found", "Briefing de imagem não encontrado nesta marca.", 404);
  if (asset.status !== "prompt_ready" || asset.storage_path) throw new WriterDeliverableError("asset_already_uploaded", "O ativo já possui arquivo; crie outro briefing para uma nova imagem.", 409);
  const extension = mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp";
  const documentPath = createHash("sha256").update(input.documentId).digest("hex").slice(0, 32);
  const path = `${input.brandId}/${documentPath}/${input.assetId}.${extension}`;
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  const storage = client.storage.from("writer-media");
  const uploaded = await storage.upload(path, input.bytes, { contentType: mime, upsert: false });
  if (uploaded.error) throw new WriterDeliverableError("storage_upload_failed", "Falha ao enviar imagem ao armazenamento.", 503);
  try {
    const readback = await storage.download(path);
    if (readback.error || !readback.data) throw new WriterDeliverableError("storage_readback_failed", "Arquivo enviado, mas a leitura de confirmação falhou.", 502);
    const receivedHash = createHash("sha256").update(Buffer.from(await readback.data.arrayBuffer())).digest("hex");
    if (receivedHash !== hash) throw new WriterDeliverableError("storage_hash_mismatch", "O arquivo recuperado não corresponde ao enviado.", 502);
    const { data, error } = await client.from("writer_media_assets")
      .update({ status: "uploaded", storage_path: path, mime_type: mime, file_hash: hash, updated_by: input.actorId })
      .eq("id", input.assetId).eq("marca_id", input.brandId).eq("document_id", input.documentId)
      .eq("status", "prompt_ready").select("id,status,storage_path,file_hash").maybeSingle();
    if (error) mapPersistenceError(error);
    if (!data || data.file_hash !== hash) throw new WriterDeliverableError("asset_readback_failed", "A confirmação do ativo falhou.", 502);
    return { assetId: data.id, status: data.status, fileHash: data.file_hash };
  } catch (error) {
    await storage.remove([path]);
    throw error;
  }
}
