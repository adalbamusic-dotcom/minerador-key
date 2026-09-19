/**
 * ===== M4 · O LIFECYCLE DO ENTREGÁVEL, COMO REGRA PURA =====
 *
 * Sem I/O, sem `server-only`. Mesmo desenho de `version-lifecycle.ts`: a
 * decisão mora aqui, exercitável sem banco; a execução é da RPC.
 *
 * ==================== A INVARIANTE ====================
 *
 *   autosave / salvar rascunho  → estado corrente, ZERO versões
 *   primeira finalização        → versão A, corrente = A
 *   reabrir                     → volta a draft, versões intactas
 *   refinalizar com mudança     → versão B, B.previous = A, corrente = B
 *   A entra em retenção         → só depois do readback confirmar B
 *
 * ==================== POR QUE ISTO EXISTE ANTES DA M4 ====================
 *
 * A M4 ainda não foi aplicada. Estas regras descrevem o comportamento que ela
 * estabelece, e os testes as exercitam de verdade — o que NÃO provam é que o
 * banco já se comporta assim. Enquanto a migration não rodar, o save remoto
 * continua versionando rascunho.
 */

export type DeliverableStatus = "draft" | "in_review" | "approved";

/** O mínimo que a decisão precisa ver. O resto da linha não influencia. */
export type DeliverableState = {
  status: DeliverableStatus;
  /** Hash do payload gravado agora. */
  contentHash: string;
  currentVersionId: string | null;
  /** Hash da versão apontada por `currentVersionId`, quando existir. */
  currentVersionHash: string | null;
  lockVersion: number;
};

/* ==========================================================================
 * SALVAR RASCUNHO
 * ========================================================================== */

export type DraftSaveRefusal = "approved_immutable" | "lock_conflict";

export type DraftSaveDecision =
  | { allowed: true; createsVersion: false; movesCurrentVersion: false; unchanged: boolean }
  | { allowed: false; refusal: DraftSaveRefusal };

/**
 * ===== RASCUNHO NUNCA VERSIONA =====
 *
 * `createsVersion` e `movesCurrentVersion` são literais `false` no tipo, não
 * valores calculados. Não existe caminho neste módulo que devolva outra coisa —
 * se alguém precisar que um save versione, o tipo recusa antes do teste.
 *
 * Finalizado não se edita direto: reabrir é ato próprio, com contrato próprio.
 */
export function planDraftSave(input: {
  state: DeliverableState | null;
  nextContentHash: string;
  expectedLock: number | null;
}): DraftSaveDecision {
  const { state, nextContentHash, expectedLock } = input;

  /* Entregável que ainda não existe: nasce como rascunho puro. */
  if (!state) {
    return expectedLock === null
      ? { allowed: true, createsVersion: false, movesCurrentVersion: false, unchanged: false }
      : { allowed: false, refusal: "lock_conflict" };
  }

  if (state.status === "approved") return { allowed: false, refusal: "approved_immutable" };

  /* Save idêntico não é erro nem escrita: é nada. */
  if (state.contentHash === nextContentHash) {
    return { allowed: true, createsVersion: false, movesCurrentVersion: false, unchanged: true };
  }

  if (expectedLock !== state.lockVersion) return { allowed: false, refusal: "lock_conflict" };
  return { allowed: true, createsVersion: false, movesCurrentVersion: false, unchanged: false };
}

/* ==========================================================================
 * FINALIZAR
 * ========================================================================== */

export type FinalizationRefusal = "not_found" | "lock_conflict" | "state_inconsistent";

export type FinalizationDecision =
  /** Cria versão. `previousVersionId` é a corrente de antes — NULL na primeira. */
  | { action: "create_version"; previousVersionId: string | null }
  /** Já finalizado e sem mudança material: devolve a mesma versão. */
  | { action: "unchanged"; versionId: string }
  | { action: "refuse"; refusal: FinalizationRefusal };

/**
 * ===== A IDEMPOTÊNCIA VEM DO HASH, QUE O PROJETO JÁ USA =====
 *
 * Não inventei mecanismo de comparação: `content_hash` já é a autoridade de
 * "mudou ou não" em documento, entregável e mídia. Finalizar de novo sem
 * mudança encontra `approved` com o hash igual ao da versão corrente e devolve
 * a mesma versão.
 *
 * `approved` com hash DIFERENTE da versão corrente é estado que o save não
 * consegue produzir — ele recusa editar aprovado. Se aparecer, é corrupção, e
 * finalizar por cima esconderia o problema em vez de expô-lo.
 */
export function planFinalization(input: {
  state: DeliverableState | null;
  expectedLock: number | null;
}): FinalizationDecision {
  const { state, expectedLock } = input;
  if (!state) return { action: "refuse", refusal: "not_found" };

  if (state.status === "approved") {
    if (state.currentVersionId && state.currentVersionHash === state.contentHash) {
      return { action: "unchanged", versionId: state.currentVersionId };
    }
    return { action: "refuse", refusal: "state_inconsistent" };
  }

  if (expectedLock !== state.lockVersion) return { action: "refuse", refusal: "lock_conflict" };

  /* A corrente de antes vira a predecessora. NULL na primeira finalização. */
  return { action: "create_version", previousVersionId: state.currentVersionId };
}

/* ==========================================================================
 * REABRIR
 * ========================================================================== */

export type ReopenDecision =
  | { action: "reopen" }
  /** Já estava editável: reabrir de novo não é erro, é nada. */
  | { action: "unchanged"; status: DeliverableStatus };

/**
 * Reabrir muda SÓ o status. Versões e `currentVersionId` ficam intactos: a
 * versão finalizada continua sendo a corrente enquanto a próxima não existir.
 *
 * Sem este ato, `approved` seria parede — o save recusa e não há volta. E
 * deixar o save reabrir por conta própria seria editar um finalizado sem dizer
 * que ele deixou de ser finalizado.
 */
export function planReopen(state: DeliverableState): ReopenDecision {
  return state.status === "approved" ? { action: "reopen" } : { action: "unchanged", status: state.status };
}

/* ==========================================================================
 * RETENÇÃO — o segundo ato, depois do readback
 * ========================================================================== */

export type RetentionStep =
  | { mark: false; reason: "no_predecessor" | "readback_failed" | "unchanged_finalization" }
  | { mark: true; predecessorVersionId: string; successorVersionId: string };

/**
 * ===== A ORDEM QUE PROTEGE A ÚNICA CÓPIA BOA =====
 *
 *   persistir B → current = B → READBACK confirma B → só então marcar A
 *
 * Se o readback não confirmar, A **não** entra em retenção: a janela de 48h
 * abriria sobre o que talvez seja a única versão boa. E se a marcação de A
 * falhar depois de B confirmado, B continua corrente e A fica retido por mais
 * tempo — nunca se compensa apagando B.
 */
export function planRetentionAfterFinalization(input: {
  decision: FinalizationDecision;
  /** A versão que o READBACK devolveu como corrente. */
  readbackCurrentVersionId: string | null;
  /** O id que a RPC disse ter criado. */
  createdVersionId: string | null;
}): RetentionStep {
  const { decision, readbackCurrentVersionId, createdVersionId } = input;

  if (decision.action === "unchanged") return { mark: false, reason: "unchanged_finalization" };
  if (decision.action !== "create_version") return { mark: false, reason: "readback_failed" };
  if (!decision.previousVersionId) return { mark: false, reason: "no_predecessor" };

  /* A confirmação é o readback concordar com o recibo. */
  if (!createdVersionId || readbackCurrentVersionId !== createdVersionId) {
    return { mark: false, reason: "readback_failed" };
  }

  return { mark: true, predecessorVersionId: decision.previousVersionId, successorVersionId: createdVersionId };
}

/**
 * Finalizar NÃO entrega. `publication_record` nasce de
 * `sendWriterToPublications`, e nada neste módulo o cria — a função existe para
 * que a separação seja afirmável por teste, e não só por comentário.
 */
export function finalizationCreatesPublicationRecord(): false {
  return false;
}

/* ==========================================================================
 * VERSÕES LEGADAS DE RASCUNHO — A DECISÃO CANÔNICA DE 2026-09-19
 * ==========================================================================
 *
 *   DRAFT_IS_HISTORY = NO
 *   FIRST_FINAL_VERSION_PREVIOUS_ID = NULL
 *   LEGACY_DRAFT_VERSION_ENTERS_M2 = NO
 *
 * O save antigo criava linha de versão a cada rascunho alterado. Essas linhas
 * existem, ficam, e NÃO são finalizações — logo não podem ser predecessoras da
 * primeira versão final. Se fossem, entrariam na janela de 48h como se tivessem
 * sido substituídas, e o lifecycle M2 passaria a carregar um snapshot que nunca
 * representou uma decisão editorial.
 */

/** Os dois motivos que o save ANTIGO escrevia. Nenhum deles é finalização. */
export const LEGACY_DRAFT_CHANGE_REASONS = ["Rascunho inicial.", "Revisão do rascunho."] as const;

/** O único motivo que `writer_finalize_deliverable` escreve. */
export const FINAL_CHANGE_REASON = "Finalização do entregável.";

export type VersionClass = "LEGACY_DRAFT_VERSION" | "FINAL_VERSION" | "UNKNOWN";

export type VersionRow = {
  versionId: string;
  deliverableId: string;
  changeReason: string;
  supersededAt: string | null;
};

export function classifyVersion(changeReason: string): VersionClass {
  if (changeReason === FINAL_CHANGE_REASON) return "FINAL_VERSION";
  return (LEGACY_DRAFT_CHANGE_REASONS as readonly string[]).includes(changeReason)
    ? "LEGACY_DRAFT_VERSION"
    : "UNKNOWN";
}

/**
 * Espelha a guarda `writer_predecessor_nao_e_final` da M4. Só uma final
 * canônica, do próprio entregável e ainda não substituída, pode ser
 * predecessora. Desconhecido é tratado como não — falha fechada.
 */
export function mayBePredecessor(input: { version: VersionRow; deliverableId: string }): boolean {
  const { version, deliverableId } = input;
  return classifyVersion(version.changeReason) === "FINAL_VERSION"
    && version.deliverableId === deliverableId
    && version.supersededAt === null;
}

/* ==========================================================================
 * O ESTADO DEPOIS DE UM SAVE DE RASCUNHO
 * ========================================================================== */

export type DraftSaveOutcome =
  | {
      saved: true;
      next: DeliverableState;
      /**
       * Tupla vazia no TIPO, não no valor: um save que criasse versão não
       * compila. `readonly []` só aceita `[]`.
       */
      createdVersionIds: readonly [];
    }
  | { saved: false; refusal: DraftSaveRefusal };

/**
 * ===== POR QUE ESTA FUNÇÃO EXISTE =====
 *
 * Para que "o save não mexe na corrente" seja EXERCITÁVEL. Sem ela, um teste de
 * sequência montaria o próximo estado à mão e provaria o próprio spread — o
 * defeito que já apareceu antes neste projeto.
 *
 * O que muda num save aceito: payload/hash e o `lockVersion`, que o trigger
 * incrementa. O que NÃO muda: `currentVersionId`. Nem para outro id, nem para
 * NULL. Depois de um reopen, a última final continua sendo a corrente enquanto
 * o novo rascunho está sendo editado — quem move a corrente é a finalização.
 */
export function applyDraftSave(input: {
  state: DeliverableState;
  nextContentHash: string;
  expectedLock: number | null;
}): DraftSaveOutcome {
  const decision = planDraftSave(input);
  if (!decision.allowed) return { saved: false, refusal: decision.refusal };
  if (decision.unchanged) return { saved: true, next: input.state, createdVersionIds: [] };

  return {
    saved: true,
    next: {
      ...input.state,
      contentHash: input.nextContentHash,
      lockVersion: input.state.lockVersion + 1,
    },
    createdVersionIds: [],
  };
}

/* ==========================================================================
 * CORTE 6A.1 · DO RECIBO REMOTO ATÉ A DECISÃO DE RETENÇÃO
 *
 * O wrapper server-side é fino de propósito: ele chama a RPC, lê de volta e
 * pergunta a ESTE módulo o que fazer. Sem isso, a ordem "readback antes de
 * marcar" só seria conferível lendo o arquivo do servidor como texto — e texto
 * não recusa um refactor.
 * ========================================================================== */

/** O que a RPC `writer_finalize_deliverable` devolve, do ponto de vista da regra. */
export type FinalizationReceipt = {
  versionId?: string | null;
  previousVersionId?: string | null;
  contentHash?: string | null;
  status?: string | null;
  unchanged?: boolean;
};

/**
 * Traduz o recibo em decisão. A RPC já decidiu; isto só nomeia o que ela fez,
 * para que `planRetentionAfterFinalization` continue sendo a única autoridade
 * sobre retenção.
 */
export function finalizationDecisionFromReceipt(receipt: FinalizationReceipt | null): FinalizationDecision {
  if (!receipt?.versionId) return { action: "refuse", refusal: "state_inconsistent" };
  if (receipt.unchanged === true) return { action: "unchanged", versionId: receipt.versionId };
  return { action: "create_version", previousVersionId: receipt.previousVersionId ?? null };
}

/*
 * ===== M5 · A RECUSA POR "NADA MUDOU" SAIU DAQUI, E NÃO DEVE VOLTAR =====
 *
 * O Corte 6A.1 tinha uma regra `precheckFinalization` que recusava
 * `reopen → finalize sem editar` porque a RPC da M4 duplicaria a versão. Era
 * remendo de cliente para um defeito de autoridade.
 *
 * A M5 (`20260919043000`) resolveu na RPC: quando o hash do entregável é igual
 * ao da versão corrente, ela apenas devolve o status a `approved` reusando a
 * versão, com `unchanged: true`, sem inserir nada. A regra antiga foi REMOVIDA
 * em vez de deixada exportada e sem uso: viva, ela seria um jeito de o cliente
 * IMPEDIR o comportamento correto do banco.
 *
 * Quem lê o recibo já tem tudo: `unchanged: true` significa "nenhuma versão
 * nova", e `planRetentionAfterFinalization` devolve `unchanged_finalization`
 * para esse caso — ninguém entra em retenção.
 */

/* ==========================================================================
 * CORTE 6A.5 · FINALIZAR O ARTIGO DUAS VEZES NÃO PODE CRIAR DUAS VERSÕES
 *
 * O Artigo não tem RPC de finalização — o versionamento mora no TypeScript.
 * Então a idempotência precisa ser decidida aqui, antes de qualquer escrita,
 * e a decisão precisa ser exercitável sem banco.
 *
 * As TRÊS condições têm que valer juntas para reusar. Cada uma cobre um jeito
 * diferente de o mundo já ter mudado:
 *
 *   status igual ao alvo        → ninguém reabriu nem mudou de estado
 *   hash do documento igual     → ninguém salvou rascunho por cima depois
 *   hash da versão corrente igual→ a corrente é MESMO esta finalização
 *
 * Faltando qualquer uma, o plano é CRIAR. É o lado certo do erro: criar versão
 * a mais gera duplicata visível; reusar indevidamente engoliria uma finalização
 * de verdade, e o trabalho da pessoa não viraria versão nenhuma.
 * ========================================================================== */

export type ArticleFinalizationPlan =
  | { action: "reuse_current"; versionId: string }
  | { action: "create_version" };

export function planArticleFinalization(input: {
  document: { status: string; contentHash: string; currentVersionId: string | null } | null;
  /** Hash da versão apontada por `current_version_id`, lido do servidor. */
  currentVersionContentHash: string | null;
  incomingContentHash: string;
  /** O status que esta finalização quer deixar gravado, já na grafia da coluna. */
  targetStatus: string;
}): ArticleFinalizationPlan {
  const { document, currentVersionContentHash, incomingContentHash, targetStatus } = input;
  if (!document || !document.currentVersionId) return { action: "create_version" };
  if (document.status !== targetStatus) return { action: "create_version" };
  if (document.contentHash !== incomingContentHash) return { action: "create_version" };
  if (currentVersionContentHash !== incomingContentHash) return { action: "create_version" };
  return { action: "reuse_current", versionId: document.currentVersionId };
}

export type FinalizationReadbackFailure =
  | "not_found"
  | "status_not_approved"
  | "current_version_mismatch"
  | "hash_mismatch";

export type FinalizationReadbackCheck =
  | { ok: true }
  | { ok: false; reason: FinalizationReadbackFailure };

/**
 * ===== O READBACK É OBRIGATÓRIO, E ESTAS SÃO AS TRÊS PERGUNTAS =====
 *
 * status finalizado · a corrente é a versão do recibo · o hash bate.
 *
 * Qualquer uma falhando, o predecessor NÃO entra em retenção: a janela de 48h
 * abriria sobre o que talvez seja a única versão boa. Falha fechada — readback
 * ausente é recusa, não "provavelmente deu certo".
 */
export function verifyFinalizationReadback(input: {
  readback: { status: string; currentVersionId: string | null; contentHash: string } | null;
  receipt: FinalizationReceipt | null;
  /**
   * O estado que a leitura de volta precisa mostrar. `approved` é o do
   * entregável e continua sendo o padrão.
   *
   * O ARTIGO reusa esta mesma regra, mas tem um estado a mais que também cria
   * versão: enviar para revisão (`in_review`). Forçar `approved` ali faria a
   * conferência reprovar uma gravação correta, e a retenção seria pulada por um
   * motivo inventado. O parâmetro existe para isso — não para relaxar a regra.
   */
  expectedStatus?: string;
}): FinalizationReadbackCheck {
  const { readback, receipt } = input;
  const esperado = input.expectedStatus ?? "approved";
  if (!readback || !receipt?.versionId) return { ok: false, reason: "not_found" };
  if (readback.status !== esperado) return { ok: false, reason: "status_not_approved" };
  if (readback.currentVersionId !== receipt.versionId) return { ok: false, reason: "current_version_mismatch" };
  if (receipt.contentHash && readback.contentHash !== receipt.contentHash) {
    return { ok: false, reason: "hash_mismatch" };
  }
  return { ok: true };
}

/**
 * ===== REABRIR NÃO PODE PERDER A ÚLTIMA FINAL =====
 *
 * `approved → draft` com `current_version_id` intacto. Se a leitura de volta
 * mostrar outra coisa, é defeito — e é melhor dizer isso do que devolver
 * silêncio para uma tela que vai afirmar "reaberto".
 */
export type ReopenReadbackCheck =
  | { ok: true }
  | { ok: false; reason: "not_found" | "status_not_draft" | "lost_last_final" };

export function verifyReopenReadback(input: {
  readback: { status: string; currentVersionId: string | null } | null;
  currentVersionIdBefore: string | null;
}): ReopenReadbackCheck {
  const { readback, currentVersionIdBefore } = input;
  if (!readback) return { ok: false, reason: "not_found" };
  if (readback.status !== "draft") return { ok: false, reason: "status_not_draft" };
  if (readback.currentVersionId !== currentVersionIdBefore) return { ok: false, reason: "lost_last_final" };
  return { ok: true };
}
