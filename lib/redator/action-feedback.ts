/**
 * ===== CORTE 6A.8 · UMA AÇÃO QUE FALHA PRECISA PARECER QUE FALHOU =====
 *
 * ==================== O DEFEITO QUE ISTO FECHA ====================
 *
 * A linha de estado do entregável usava SEMPRE `text-text-muted`. Um 409, um 401
 * ou um 500 em "Reabrir para edição" apareciam na mesma cor cinza e no mesmo
 * lugar que "Sem alterações pendentes", truncados em `max-w-64`.
 *
 * Clicar, falhar e não perceber era o comportamento esperado daquela tela — e é
 * a explicação mais econômica para três readbacks seguidos em que a execução
 * relatada não aparecia no banco.
 *
 * ==================== POR QUE ISTO É UM MÓDULO PURO ====================
 *
 * O Artigo já tinha a convenção certa, escrita à mão dentro do JSX. Repeti-la no
 * entregável criaria duas convenções que divergiriam no primeiro ajuste — e o
 * pedido era explícito: não criar uma segunda.
 *
 * Aqui a decisão é uma só, sem React, exercitável por teste sem montar tela.
 */

export type FeedbackTone = "neutro" | "progresso" | "sucesso" | "erro";

/** O vocabulário de estado que o Artigo já usava. */
export type SaveFeedbackState =
  | "idle" | "dirty" | "saving" | "saved_server" | "saved_local" | "conflict" | "error";

export function toneForSaveState(state: SaveFeedbackState): FeedbackTone {
  if (state === "saving") return "progresso";
  if (state === "saved_server" || state === "saved_local") return "sucesso";
  if (state === "conflict" || state === "error") return "erro";
  return "neutro";
}

/**
 * ===== O TOM VEM DO CÓDIGO HTTP, NÃO DE ADIVINHAÇÃO =====
 *
 * 409 é conflito — o servidor entendeu e recusou por estado. 401 e 5xx são
 * falhas de outra natureza, mas para quem opera a diferença que importa é uma
 * só: **não deu certo**. Por isso os dois pintam de `erro`; o que os distingue é
 * a mensagem, não a cor.
 */
export function toneForHttpStatus(status: number): FeedbackTone {
  return status >= 200 && status < 300 ? "sucesso" : "erro";
}

export type ActionFailure = {
  tone: "erro";
  /** O que apareceu na barra. Curto o bastante para caber, claro o bastante para agir. */
  mensagem: string;
  /** `true` quando o servidor recusou por estado, não por falha. */
  conflito: boolean;
};

const MENSAGEM_POR_STATUS: Readonly<Record<number, string>> = {
  401: "Sessão expirada. Entre novamente para continuar.",
  403: "Sem permissão para esta ação nesta marca.",
  404: "Entregável não encontrado neste documento.",
  503: "Serviço indisponível no momento. Tente de novo em instantes.",
};

/**
 * Traduz a resposta não-2xx sem engolir o que o servidor disse.
 *
 * A mensagem do servidor tem precedência: ela sabe o motivo exato
 * (`writer_lock_conflict`, `writer_deliverable_finalized`, …). O mapa por status
 * é o fallback para quando a resposta não traz corpo legível — um 500 de
 * gateway, por exemplo.
 */
export function describeActionFailure(input: {
  status: number;
  body?: { error?: unknown; code?: unknown } | null;
}): ActionFailure {
  const doServidor = typeof input.body?.error === "string" && input.body.error.trim()
    ? input.body.error.trim()
    : typeof input.body?.code === "string" && input.body.code.trim()
      ? input.body.code.trim()
      : "";

  const mensagem = doServidor
    || MENSAGEM_POR_STATUS[input.status]
    || `A ação não foi concluída (HTTP ${input.status}).`;

  return { tone: "erro", mensagem, conflito: input.status === 409 };
}

/* ==========================================================================
 * APARÊNCIA — a mesma tabela para o Artigo e para o entregável
 * ========================================================================== */

export const FEEDBACK_TEXT_CLASS: Readonly<Record<FeedbackTone, string>> = {
  neutro: "text-text-muted",
  progresso: "text-context-accent",
  sucesso: "text-success",
  erro: "text-danger",
};

/**
 * ===== ERRO NÃO PODE SUMIR EM RETICÊNCIAS =====
 *
 * Mensagem neutra pode truncar: "Sem alterações pendentes" cortado não custa
 * nada. Erro, sim — é justamente o texto que diz o que fazer a seguir.
 *
 * A barra tem altura fixa, então a mensagem não pode quebrar em duas linhas.
 * A saída é dar mais largura ao erro e devolver o texto inteiro por `title`;
 * quem chama ainda mostra o bloco contextual no corpo, que tem espaço de sobra.
 */
export function feedbackWidthClass(tone: FeedbackTone): string {
  return tone === "erro" ? "max-w-md" : "max-w-64";
}

export function feedbackClass(tone: FeedbackTone): string {
  return `min-w-0 ${feedbackWidthClass(tone)} truncate ${FEEDBACK_TEXT_CLASS[tone]}`;
}

/* ==========================================================================
 * AÇÕES DO ENTREGÁVEL — o rótulo diz o que está acontecendo
 * ========================================================================== */

export type DeliverableAction = "salvar" | "finalizar" | "reabrir";

const ROTULO_EM_CURSO: Readonly<Record<DeliverableAction, string>> = {
  salvar: "Salvando…",
  finalizar: "Finalizando…",
  reabrir: "Reabrindo…",
};

export function progressMessage(action: DeliverableAction): string {
  return ROTULO_EM_CURSO[action];
}

/**
 * O botão em curso muda de rótulo; os outros só desabilitam. Um botão que
 * continua dizendo "Finalizar roteiro" enquanto finaliza convida ao segundo
 * clique — e a idempotência do servidor não é desculpa para a tela mentir.
 */
export function actionButtonLabel(input: {
  action: DeliverableAction;
  emCurso: DeliverableAction | null;
  rotuloParado: string;
}): string {
  return input.emCurso === input.action ? progressMessage(input.action) : input.rotuloParado;
}
