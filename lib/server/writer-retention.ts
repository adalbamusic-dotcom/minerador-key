/**
 * ===== CORTE 3 · SUCESSÃO DE VERSÕES DO REDATOR =====
 *
 * ==================== O QUE ESTE MÓDULO FAZ ====================
 *
 * Depois que uma versão nova foi gravada E CONFIRMADA na leitura remota, ele
 * marca a versão ANTERIOR como substituída. Só isso. Ele não grava conteúdo,
 * não decide lock, não apaga nada.
 *
 * ==================== POR QUE É UM SEGUNDO ATO ====================
 *
 * A gravação é atômica dentro da RPC: estado corrente e versão imutável entram
 * na mesma transação. Mas o READBACK só existe depois do commit — não dá para
 * conferir do lado de fora uma transação que ainda não terminou.
 *
 * Marcar o predecessor DENTRO da gravação significaria abrir a janela de 48h
 * antes de saber se o sucessor sobreviveu. Se o commit passasse e o readback
 * revelasse divergência, o predecessor já estaria contando o tempo — e ele é a
 * única cópia boa que restaria.
 *
 *   SAVE SUCCESSOR → SET CURRENT → COMMIT
 *   → REMOTE READBACK → VERIFY CURRENT/HASH/LOCK
 *   → MARK PREDECESSOR SUPERSEDED
 *
 * ==================== O MODO DE FALHA É GUARDAR DEMAIS ====================
 *
 * Se a marcação falhar depois de o sucessor já estar confirmado, o sucessor
 * PERMANECE corrente e a falha é registrada. O predecessor fica retido por mais
 * tempo — que é o resultado inofensivo. Nunca se compensa apagando um sucessor
 * válido: isso trocaria uma limpeza adiada por perda de trabalho.
 *
 * Por isso nada aqui lança para o caminho de gravação. Tudo devolve desfecho.
 *
 * ==================== O CLIENTE NÃO É AUTORIDADE ====================
 *
 * Nenhum id usado aqui vem do cliente. O sucessor é o recibo da própria RPC,
 * conferido contra `current_version_id` no readback; o predecessor é lido do
 * SERVIDOR, do campo `previous_version_id` do sucessor. Um id que chegasse pela
 * requisição poderia apontar para a versão corrente de outro documento.
 *
 * ==================== ANTES DA M2 ESTE MÓDULO É INERTE ====================
 *
 * `writer_deliverables.current_version_id` e as RPCs `writer_mark_*` só existem
 * depois da M2. Enquanto ela não for aplicada, a capacidade é detectada como
 * ausente e a marcação devolve `unavailable` — sem erro, sem log de pânico e
 * sem mudar o que o Redator já faz hoje.
 */

import "server-only";
import { getOperationalClient } from "./editorial-db";

/*
 * As REGRAS moram em `lib/redator/version-lifecycle.ts` — puras, sem
 * `server-only`, testáveis sem banco. Este módulo é o I/O que as obedece.
 */
export { RECOVERY_WINDOW_HOURS, recoveryWindowEnd, planSupersede, canMarkWithAuthority } from "../redator/version-lifecycle.ts";
export type { SupersedeDecision, SupersedeOutcome, SupersedeSkipReason, CurrentVersionAuthority } from "../redator/version-lifecycle.ts";
import { planSupersede, type SupersedeOutcome } from "../redator/version-lifecycle.ts";

/* ==========================================================================
 * DETECÇÃO DE CAPACIDADE — o código precisa atravessar a fronteira da M2
 * ========================================================================== */

type Capability = { deliverableCurrentVersionColumn: boolean; checkedAt: number };
let cache: Capability | null = null;
/** Curto de propósito: a M2 pode ser aplicada com o processo no ar. */
const CAPABILITY_TTL_MS = 60_000;

/** Só para teste: descarta a detecção em cache. */
export function resetWriterRetentionCapability() { cache = null; }

/**
 * `current_version_id` em `writer_deliverables` é o marcador da M2.
 *
 * A M2 cria a coluna e as RPCs de marcação na MESMA transação, então a presença
 * da coluna implica a presença das funções. Detectar pela coluna é uma leitura
 * barata; detectar pela RPC exigiria chamá-la, e chamar para descobrir se existe
 * é o tipo de sonda que um dia escreve.
 */
export async function writerRetentionAvailable(): Promise<boolean> {
  if (cache && Date.now() - cache.checkedAt < CAPABILITY_TTL_MS) return cache.deliverableCurrentVersionColumn;
  const probe = await getOperationalClient().from("writer_deliverables").select("current_version_id").limit(1);
  const ausente = Boolean(probe.error) && (probe.error?.code === "42703"
    || /current_version_id/i.test(probe.error?.message || ""));
  /*
   * Erro que NÃO é de coluna ausente (rede, permissão) não vira "indisponível"
   * em cache: seria transformar uma falha passageira numa desativação silenciosa
   * da retenção, que ninguém notaria.
   */
  if (probe.error && !ausente) return false;
  cache = { deliverableCurrentVersionColumn: !ausente, checkedAt: Date.now() };
  return cache.deliverableCurrentVersionColumn;
}

/* ==========================================================================
 * LEITURA DO PREDECESSOR — do servidor, nunca do cliente
 * ========================================================================== */

async function predecessorOfDocumentVersion(documentId: string, successorVersionId: string) {
  const { data, error } = await getOperationalClient().from("content_document_versions")
    .select("previous_version_id").eq("document_id", documentId).eq("version_id", successorVersionId).maybeSingle();
  if (error || !data) return null;
  return (data.previous_version_id as string | null) ?? null;
}

async function predecessorOfDeliverableVersion(deliverableId: string, successorVersionId: string) {
  const { data, error } = await getOperationalClient().from("writer_deliverable_versions")
    .select("previous_version_id").eq("deliverable_id", deliverableId).eq("version_id", successorVersionId).maybeSingle();
  if (error || !data) return null;
  return (data.previous_version_id as string | null) ?? null;
}

/* ==========================================================================
 * AUTORIDADE DA VERSÃO CORRENTE
 * ========================================================================== */

/**
 * ARTIGO — a autoridade já existe e já é verificada.
 *
 * `content_documents.current_version_id` é gravada por `writer_save_article_draft`
 * na mesma transação da versão, e o readback de `saveWriterArticleDraft` já a
 * compara com o recibo. Este módulo NÃO cria uma segunda autoridade: ele lê a
 * que existe.
 */
export async function articleCurrentVersionId(brandId: string, documentId: string) {
  const { data, error } = await getOperationalClient().from("content_documents")
    .select("current_version_id").eq("id", documentId).eq("marca_id", brandId).maybeSingle();
  if (error || !data) return null;
  return (data.current_version_id as string | null) ?? null;
}

export type DeliverableCurrentVersion = {
  versionId: string | null;
  /** `column` depois da M2; `max_version_number` é o caminho legado, e some com ela. */
  authority: "column" | "max_version_number";
};

/**
 * ROTEIRO E CARROSSEL — a autoridade muda com a M2.
 *
 * Antes: dedução por `max(version_number)`. Depois: a coluna.
 *
 * Deduzir a corrente é frágil exatamente na operação que apaga as outras — uma
 * leitura errada apagaria a versão viva. Por isso o retorno diz de onde veio a
 * resposta: quem consome pode recusar a marcação enquanto a autoridade for
 * deduzida, em vez de confiar sem saber.
 */
export async function deliverableCurrentVersionId(brandId: string, deliverableId: string): Promise<DeliverableCurrentVersion> {
  const client = getOperationalClient();
  if (await writerRetentionAvailable()) {
    const { data, error } = await client.from("writer_deliverables")
      .select("current_version_id").eq("id", deliverableId).eq("marca_id", brandId).maybeSingle();
    if (!error && data) return { versionId: (data.current_version_id as string | null) ?? null, authority: "column" };
  }
  const { data, error } = await client.from("writer_deliverable_versions")
    .select("version_id,version_number").eq("deliverable_id", deliverableId)
    .order("version_number", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return { versionId: null, authority: "max_version_number" };
  return { versionId: data.version_id as string, authority: "max_version_number" };
}

/* ==========================================================================
 * MARCAÇÃO — o segundo ato, depois do readback
 * ========================================================================== */

function outcomeFromRpcError(message: string): SupersedeOutcome {
  /* A M2 não está aplicada: a função não existe. Estado esperado. */
  if (/does not exist|PGRST202|42883|schema cache/i.test(message)) return { status: "unavailable" };
  const conhecidos = ["retention_successor_not_current", "retention_self_supersede", "retention_version_not_found",
    "retention_document_not_found", "retention_deliverable_not_found", "retention_already_superseded_by_other"];
  const achado = conhecidos.find(codigo => message.includes(codigo));
  return { status: "failed", code: achado || "retention_mark_failed" };
}

/**
 * ARTIGO — marca a predecessora real, e só ela.
 *
 * `successorVersionId` e `currentVersionId` vêm do recibo e do readback que o
 * chamador acabou de conferir. `predecessorVersionId` é lido do servidor.
 * NUNCA lança: devolve desfecho.
 *
 * ===== M6 · ESTA FUNÇÃO ESTÁ SEM CHAMADOR. LEIA ANTES DE ASSUMIR =====
 *
 * Até a M6 (2026-09-19) quem a chamava era `saveWriterArticleDraft`, o caminho
 * MCP — que criava versão a cada save de rascunho. Isso era o defeito, e a
 * chamada saiu junto com ele.
 *
 * Quem cria versão de artigo hoje é a finalização, pela rota da tela
 * (`PATCH /api/editorial/documents` com `createVersion: true`), e ela **não**
 * chama marcação nenhuma. Consequência a registrar sem rodeio: **versões de
 * artigo não entram em retenção**. Elas se acumulam, e nada abre a janela de
 * 48h sobre a predecessora.
 *
 * Isso NÃO é regressão da M6 — a rota da tela nunca marcou. É um buraco que a
 * M6 tornou visível ao remover o único chamador que existia, e que fica para a
 * rodada que cuidar do lifecycle do Artigo. Corrigi-lo aqui seria alterar a
 * finalização do Artigo, o que o Corte 6A.3 proibiu explicitamente.
 *
 * ATUALIZAÇÃO (Corte 6A.4): ela voltou a ter chamador. Quem a chama agora é
 * `finalizeArticleVersion` em `lib/server/article-finalization.ts`, depois do
 * readback confirmar que a nova versão virou a corrente. O buraco descrito
 * acima está fechado: versões de artigo entram em retenção de novo, e só pelo
 * caminho da finalização.
 *
 * A função fica porque é a autoridade correta para esse dia — não porque esteja
 * em uso. Ver docs/00-produto/auditorias/corte-6a-3-homologacao-e-mcp-draft-2026-09-19.md
 */
export async function markArticlePredecessorSuperseded(input: {
  brandId: string; documentId: string;
  successorVersionId: string | null | undefined;
  currentVersionId: string | null | undefined;
  unchanged: boolean;
}): Promise<SupersedeOutcome> {
  try {
    if (!(await writerRetentionAvailable())) return { status: "unavailable" };
    const predecessorVersionId = input.successorVersionId
      ? await predecessorOfDocumentVersion(input.documentId, input.successorVersionId) : null;
    const decisao = planSupersede({ unchanged: input.unchanged, successorVersionId: input.successorVersionId,
      currentVersionId: input.currentVersionId, predecessorVersionId });
    if (decisao.action === "skip") return { status: "skipped", reason: decisao.reason };

    const { data, error } = await getOperationalClient().rpc("writer_mark_document_version_superseded", {
      p_brand_id: input.brandId, p_document_id: input.documentId,
      p_version_id: decisao.predecessorVersionId, p_successor_version_id: decisao.successorVersionId,
    });
    if (error) return outcomeFromRpcError(error.message || "");
    const recibo = data as { supersededAt?: string; purgeAfter?: string; unchanged?: boolean } | null;
    if (recibo?.unchanged === true) return { status: "already_marked", predecessorVersionId: decisao.predecessorVersionId };
    return { status: "marked", predecessorVersionId: decisao.predecessorVersionId,
      supersededAt: recibo?.supersededAt ?? null, purgeAfter: recibo?.purgeAfter ?? null };
  } catch (erro) {
    return outcomeFromRpcError(erro instanceof Error ? erro.message : "");
  }
}

/** ROTEIRO E CARROSSEL — mesma regra, mesma ordem, autoridade própria. */
export async function markDeliverablePredecessorSuperseded(input: {
  brandId: string; deliverableId: string;
  successorVersionId: string | null | undefined;
  currentVersionId: string | null | undefined;
  unchanged: boolean;
}): Promise<SupersedeOutcome> {
  try {
    if (!(await writerRetentionAvailable())) return { status: "unavailable" };
    const predecessorVersionId = input.successorVersionId
      ? await predecessorOfDeliverableVersion(input.deliverableId, input.successorVersionId) : null;
    const decisao = planSupersede({ unchanged: input.unchanged, successorVersionId: input.successorVersionId,
      currentVersionId: input.currentVersionId, predecessorVersionId });
    if (decisao.action === "skip") return { status: "skipped", reason: decisao.reason };

    const { data, error } = await getOperationalClient().rpc("writer_mark_deliverable_version_superseded", {
      p_brand_id: input.brandId, p_deliverable_id: input.deliverableId,
      p_version_id: decisao.predecessorVersionId, p_successor_version_id: decisao.successorVersionId,
    });
    if (error) return outcomeFromRpcError(error.message || "");
    const recibo = data as { supersededAt?: string; purgeAfter?: string; unchanged?: boolean } | null;
    if (recibo?.unchanged === true) return { status: "already_marked", predecessorVersionId: decisao.predecessorVersionId };
    return { status: "marked", predecessorVersionId: decisao.predecessorVersionId,
      supersededAt: recibo?.supersededAt ?? null, purgeAfter: recibo?.purgeAfter ?? null };
  } catch (erro) {
    return outcomeFromRpcError(erro instanceof Error ? erro.message : "");
  }
}
