import type { RadarSpecialistState } from "./specialist-lifecycle.ts";
import type { RadarSpecialistInviteState } from "./specialist-consultation.ts";

/**
 * UM PONTO, UM FLUXO, UMA PRÓXIMA AÇÃO — SPECIALIST_3 · §1, §2 e §3.
 *
 * ========================= O QUE ESTAVA ERRADO =========================
 *
 * A tela mostrava "PONTOS PARA REVISÃO" e "PAUTAS / PEDIDOS" como duas listas
 * lado a lado. Elas não são duas coisas: a pauta é o que o ponto vira. Com um
 * ponto preparado e a sua pauta derivada, a coluna exibia o MESMO título duas
 * vezes, em dois cards com botões diferentes — e a leitura natural era que
 * havia dois pedidos a enviar. Enviar um deixava o outro parecendo travado.
 *
 * ===================== E POR QUE OS BOTÕES PARECIAM MORTOS =====================
 *
 * "Enviar pauta" ficava desabilitado enquanto o brief não estivesse aprovado, e
 * a aprovação morava no editor lá embaixo, atrás de "Abrir pauta". O critério
 * existia e era correto; ele só não estava em lugar nenhum que a pessoa pudesse
 * ler. Um botão inativo sem motivo declarado é indistinguível de um bug.
 *
 * A regra deste módulo: TODA ação desabilitada carrega o porquê, em português,
 * ao lado dela. E existe UMA próxima ação por ponto — a que vem agora, não um
 * mostruário do que um dia será possível.
 *
 * Domínio puro: sem fetch, sem storage, sem React, sem provider.
 */

/* ============================ o fluxo, em etapas =========================== */

export const RADAR_SPECIALIST_FLOW_STAGES = [
  "PONTO_PREPARADO",
  "PAUTA_PRONTA",
  "PEDIDO_ENVIADO",
  "RESPOSTA_RECEBIDA",
  "CONTRIBUICAO_A_REVISAR",
  "EVIDENCIA_DECIDIDA",
] as const;
export type RadarSpecialistFlowStage = typeof RADAR_SPECIALIST_FLOW_STAGES[number];

export const RADAR_SPECIALIST_FLOW_LABELS: Record<RadarSpecialistFlowStage, string> = {
  PONTO_PREPARADO: "Ponto preparado",
  PAUTA_PRONTA: "Pauta pronta",
  PEDIDO_ENVIADO: "Pedido enviado",
  RESPOSTA_RECEBIDA: "Resposta recebida",
  CONTRIBUICAO_A_REVISAR: "Contribuição a revisar",
  EVIDENCIA_DECIDIDA: "Evidência decidida",
};

/**
 * O ESTADO CANÔNICO CAI NUMA ETAPA — e vários caem na mesma, de propósito.
 *
 * DRAFT, INVITED, CONNECTED e APPROVED_TO_SEND são fatos diferentes do MESMO
 * momento do fluxo: a pauta existe e ainda não foi pedida. Quem opera precisa
 * saber em que ponto do caminho está; o detalhe de qual dos quatro continua
 * disponível na linha de estado, sem virar mais uma etapa na régua.
 */
const ETAPA_POR_ESTADO: Record<RadarSpecialistState, RadarSpecialistFlowStage> = {
  PREPARED: "PONTO_PREPARADO",
  DRAFT: "PAUTA_PRONTA",
  INVITED: "PAUTA_PRONTA",
  CONNECTED: "PAUTA_PRONTA",
  READY_TO_SEND: "PAUTA_PRONTA",
  APPROVED_TO_SEND: "PAUTA_PRONTA",
  SENT: "PEDIDO_ENVIADO",
  WAITING_RESPONSE: "PEDIDO_ENVIADO",
  RESPONSE_RECEIVED: "RESPOSTA_RECEBIDA",
  AWAITING_CONTRIBUTION_REVIEW: "CONTRIBUICAO_A_REVISAR",
  ACCEPTED: "EVIDENCIA_DECIDIDA",
  REJECTED: "EVIDENCIA_DECIDIDA",
  /*
   * INTERROMPIDO NÃO É UMA ETAPA DO CAMINHO.
   *
   * Bloqueada e cancelada são saídas laterais. Colocá-las na régua faria uma
   * pauta cancelada parecer "quase no fim" por estar à direita do desenho.
   */
  BLOCKED: "PONTO_PREPARADO",
  CANCELLED: "PONTO_PREPARADO",
};

export function radarSpecialistFlowStage(state: RadarSpecialistState): RadarSpecialistFlowStage {
  return ETAPA_POR_ESTADO[state];
}

export type RadarSpecialistFlowStep = {
  stage: RadarSpecialistFlowStage;
  label: string;
  /** Já aconteceu, ou é onde estamos. */
  reached: boolean;
  current: boolean;
};

/**
 * A RÉGUA DO PONTO — o mesmo título, uma vez só, com o caminho percorrido.
 *
 * `interrupted` existe porque uma pauta cancelada não pode desenhar progresso
 * nenhum: mostrar "Ponto preparado" aceso numa pauta cancelada seria convidar
 * alguém a esperar por uma resposta que não vem.
 */
export function radarSpecialistFlow(state: RadarSpecialistState): {
  stage: RadarSpecialistFlowStage;
  steps: RadarSpecialistFlowStep[];
  interrupted: boolean;
} {
  const atual = radarSpecialistFlowStage(state);
  const indice = RADAR_SPECIALIST_FLOW_STAGES.indexOf(atual);
  const interrupted = state === "BLOCKED" || state === "CANCELLED";

  return {
    stage: atual,
    interrupted,
    steps: RADAR_SPECIALIST_FLOW_STAGES.map((stage, posicao) => ({
      stage,
      label: RADAR_SPECIALIST_FLOW_LABELS[stage],
      reached: !interrupted && posicao <= indice,
      current: !interrupted && posicao === indice,
    })),
  };
}

/* ========================= o nome das ações (§2) ========================== */

/**
 * "ABRIR PAUTA" NÃO DIZ SE ABRIR CRIA, EDITA OU ENVIA OUTRA.
 *
 * Depois do envio as perguntas estão congeladas — o banco recusa alteração em
 * pauta `awaiting_expert`. Chamar isso de "Abrir" prometia uma edição que não
 * ia acontecer. Antes do envio, "Editar"; depois, "Ver".
 */
export function radarSpecialistBriefActionLabel(input: { sentAt: string | null }): string {
  return input.sentAt ? "Ver pauta" : "Editar pauta";
}

/* ==================== os controles de pergunta (§3) ====================== */

/**
 * SUBIR E DESCER COM UMA PERGUNTA SÓ NÃO FAZEM NADA — e pareciam quebrados.
 *
 * Os dois botões existiam sempre, desabilitados nas pontas. Com uma única
 * pergunta, ambos ficavam permanentemente inativos: três controles na tela,
 * dois deles inertes para sempre. Ordenar só existe quando há ordem.
 */
export function radarSpecialistQuestionControls(questionCount: number): {
  canReorder: boolean;
  canRemove: boolean;
} {
  return { canReorder: questionCount >= 2, canRemove: questionCount >= 1 };
}

/* ===================== a próxima ação, e o seu motivo ==================== */

export type RadarSpecialistActionKind =
  | "CREATE_CONSULTATION"
  | "ISSUE_INVITE"
  | "SHARE_INVITE"
  | "APPROVE_BRIEF"
  | "SEND_BRIEF"
  | "AWAIT_RESPONSE"
  | "REVIEW_CONTRIBUTION"
  | "DONE"
  | "INTERRUPTED";

export type RadarSpecialistNextAction = {
  kind: RadarSpecialistActionKind;
  label: string;
  /** `false` mostra o rótulo como estado, não como botão clicável. */
  actionable: boolean;
  enabled: boolean;
  /** POR QUE não dá para agir agora. Sempre presente quando `enabled` é falso. */
  reason: string | null;
};

export type RadarSpecialistActionContext = {
  state: RadarSpecialistState;
  /** Existe vínculo Telegram ativo: o especialista abriu o bot. */
  connected: boolean;
  inviteState: RadarSpecialistInviteState;
  /** O link do convite está em mãos NESTA sessão — ele não volta do banco. */
  hasInviteLink: boolean;
  /** O @username do Bot está confirmado no Admin. Sem ele não há link a montar. */
  botConfigured: boolean;
  sentAt: string | null;
  /** A pauta foi aprovada para envio por uma pessoa (`status = reviewed`). */
  approved: boolean;
  questionCount: number;
  /** Chegou resposta e falta decidir sobre ela. */
  pendingReview: boolean;
  contributionCount: number;
};

/**
 * A ÚNICA COISA A FAZER AGORA NESTE PONTO.
 *
 * A ordem das perguntas é a ordem do fluxo, e cada recusa nomeia o que falta.
 * Nenhum ramo devolve um botão sem rótulo nem um bloqueio sem motivo: a
 * assinatura obriga `reason` quando `enabled` é falso, e o teste cobre todos
 * os ramos exatamente por isso.
 */
export function radarSpecialistNextAction(context: RadarSpecialistActionContext): RadarSpecialistNextAction {
  if (context.state === "BLOCKED" || context.state === "CANCELLED") {
    return { kind: "INTERRUPTED", label: context.state === "BLOCKED" ? "Consulta bloqueada" : "Consulta cancelada", actionable: false, enabled: false, reason: "Esta consulta foi interrompida e não segue para envio." };
  }

  if (context.state === "PREPARED") {
    return { kind: "CREATE_CONSULTATION", label: "Criar consulta", actionable: true, enabled: true, reason: null };
  }

  /*
   * DEPOIS DO ENVIO, O QUE IMPORTA É A RESPOSTA — nunca outro envio.
   *
   * Este ramo vem antes de qualquer coisa sobre convite ou aprovação: uma pauta
   * enviada não volta a ser editável, e oferecer "Aprovar" ali era o que fazia
   * a tela parecer ter um segundo pedido pendente.
   */
  if (context.sentAt) {
    if (context.pendingReview) {
      return { kind: "REVIEW_CONTRIBUTION", label: "Revisar contribuição", actionable: true, enabled: true, reason: null };
    }
    if (context.contributionCount > 0) {
      return { kind: "DONE", label: "Contribuição decidida", actionable: false, enabled: false, reason: null };
    }
    return { kind: "AWAIT_RESPONSE", label: "Aguardando o especialista", actionable: false, enabled: false, reason: "O pedido foi enviado; a resposta chega pelo Telegram." };
  }

  if (!context.connected) {
    if (context.hasInviteLink) {
      return { kind: "SHARE_INVITE", label: "Copiar link do convite", actionable: true, enabled: true, reason: null };
    }
    /*
     * SEM BOT CONFIRMADO NÃO HÁ LINK A GERAR — e o botão mentiria.
     *
     * O deep link é `https://t.me/<bot>?start=<token>`; sem o @username do Bot
     * lido da integração, o que sairia daqui seria uma URL quebrada colada no
     * WhatsApp de um profissional.
     */
    return {
      kind: "ISSUE_INVITE",
      label: context.inviteState === "OPEN" ? "Gerar novo link" : "Gerar link do convite",
      actionable: true,
      enabled: context.botConfigured,
      reason: context.botConfigured ? null : "O username do Bot ainda não foi confirmado no Admin; sem ele o link não pode ser montado.",
    };
  }

  /*
   * PAUTA VAZIA NÃO APROVA NEM ENVIA — e o rótulo continua sendo o do passo.
   *
   * Dizer "Aprovar" sobre uma pauta JÁ aprovada seria oferecer de novo o que
   * já foi feito; o que falta ali é a pergunta, não a aprovação. O passo é o
   * mesmo dos ramos abaixo, e só o motivo muda.
   */
  if (!context.questionCount) {
    return {
      kind: context.approved ? "SEND_BRIEF" : "APPROVE_BRIEF",
      label: context.approved ? "Enviar pedido ao especialista" : "Aprovar pauta para envio",
      actionable: true,
      enabled: false,
      reason: "A pauta ainda não tem nenhuma pergunta. Edite a pauta e acrescente ao menos uma.",
    };
  }

  if (!context.approved) {
    return { kind: "APPROVE_BRIEF", label: "Aprovar pauta para envio", actionable: true, enabled: true, reason: null };
  }

  return { kind: "SEND_BRIEF", label: "Enviar pedido ao especialista", actionable: true, enabled: true, reason: null };
}
