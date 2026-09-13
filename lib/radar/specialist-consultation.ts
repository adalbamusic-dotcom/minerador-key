/**
 * A CONSULTA EXTERNA — convidar alguém sem cadastrá-lo antes.
 *
 * ============================ O QUE MUDOU ============================
 *
 * Até aqui, falar com um profissional exigia sair do Radar, ir à área Marca,
 * cadastrar um especialista e só então gerar o link. O operador tinha de
 * inventar uma identidade profissional ANTES de saber quem aceitaria revisar —
 * e o cadastro virava um passo burocrático no meio de uma decisão editorial.
 *
 * A auditoria do SPECIALIST_2.0 mostrou que a premissa nunca esteve no schema:
 * `brand_experts` já era, por comentário da própria migration, "especialista de
 * domínio da Marca; não exige login e não é membership de usuário". O que
 * faltava era a linha deixar de ser um formulário e virar o que ela sempre foi:
 * o REGISTRO de um participante externo, criado junto com a consulta.
 *
 * ========================= O QUE ELA NÃO É =========================
 *
 * Um participante de consulta NÃO é conta MineKey, NÃO é membership, NÃO tem
 * permissão de módulo e NÃO aparece em nenhuma tela de acesso. Ele existe para
 * amarrar proveniência: qual pessoa, por qual canal, respondeu qual pauta.
 *
 * ===================== POR QUE O LINK, E NÃO O ENVIO =====================
 *
 * A Bot API do Telegram não inicia conversa privada: não há método que resolva
 * telefone ou @username de usuário para `chat_id`. O `chat_id` só passa a
 * existir depois que a pessoa abre o bot. Por isso o convite é um deep link que
 * o operador compartilha pelo canal que já usa — e o `/start <token>` é o que
 * cria o vínculo.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

/* ===================== o participante provisório ====================== */

/**
 * O NOME ANTES DE SABER O NOME.
 *
 * O convite nasce sem identidade: ninguém digitou quem é, e inventar um nome
 * profissional plausível seria fabricar um dado que o sistema não tem. O rótulo
 * é explicitamente provisório, e o `/start` o substitui pelo nome real que o
 * Telegram informar.
 */
export const RADAR_SPECIALIST_PROVISIONAL_NAME = "Especialista convidado";

/**
 * Só um nome provisório pode ser sobrescrito pelo Telegram.
 *
 * Se uma pessoa digitou "Dra. Helena Braga" na área Marca, o `/start` não pode
 * trocar isso por um apelido de app. O que o Telegram traz é melhor que um
 * rótulo vazio, e pior que uma decisão humana.
 */
export function radarSpecialistIsProvisionalName(displayName: string | null | undefined): boolean {
  return (displayName || "").trim().toLowerCase() === RADAR_SPECIALIST_PROVISIONAL_NAME.toLowerCase();
}

/**
 * A IDENTIDADE QUE O TELEGRAM ENTREGA — e ela é opcional de verdade.
 *
 * `first_name` é o único campo que a Bot API garante; `username` não existe
 * para quem nunca configurou um. Devolver `null` quando não há nada é melhor do
 * que compor um nome a partir do id numérico: um número não identifica ninguém
 * para quem lê a tela.
 */
export function radarSpecialistTelegramDisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}): string | null {
  const nome = [input.firstName, input.lastName].map(item => (item || "").trim()).filter(Boolean).join(" ").trim();
  if (nome) return nome.slice(0, 160);
  const usuario = (input.username || "").trim().replace(/^@/, "");
  return usuario ? `@${usuario}`.slice(0, 160) : null;
}

/* ======================== a identidade da consulta ===================== */

/**
 * O QUE A CONSULTA GUARDA DE SI MESMA.
 *
 * Vive dentro do `radar_context` da pauta, e não numa tabela nova: a tabela
 * exigiria migration, e o SPECIALIST_2.1 decidiu explicitamente não abrir uma.
 * Todos os campos que uma consulta precisa — marca, artigo, versão, requisito,
 * quem criou, quando — já existem nas colunas de `expert_briefs` ou aqui.
 */
export type RadarSpecialistConsultation = {
  consultationId: string;
  requirementId: string;
  invitedAt: string;
  invitedBy: string;
  /** De onde este participante veio. Nunca de um formulário preenchido. */
  origin: "radar_specialist_consultation";
};

export function radarSpecialistConsultationId(input: {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  requirementId: string;
}): string {
  return ["consultation", input.brandId, input.articleId, input.articleDnaVersionId, input.requirementId].join("|");
}

export function radarSpecialistConsultationContext(input: {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  requirementId: string;
  invitedBy: string;
  invitedAt: string;
}): RadarSpecialistConsultation {
  return {
    consultationId: radarSpecialistConsultationId(input),
    requirementId: input.requirementId,
    invitedAt: input.invitedAt,
    invitedBy: input.invitedBy,
    origin: "radar_specialist_consultation",
  };
}

/** A consulta gravada numa pauta, quando ela nasceu de um convite. */
export function radarSpecialistConsultationOf(radarContext: unknown): RadarSpecialistConsultation | null {
  if (!radarContext || typeof radarContext !== "object" || Array.isArray(radarContext)) return null;
  const bruto = (radarContext as Record<string, unknown>).consultation;
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const registro = bruto as Record<string, unknown>;
  const texto = (valor: unknown) => (typeof valor === "string" && valor.trim() ? valor.trim() : "");
  if (!texto(registro.consultationId) || !texto(registro.requirementId)) return null;
  return {
    consultationId: texto(registro.consultationId),
    requirementId: texto(registro.requirementId),
    invitedAt: texto(registro.invitedAt),
    invitedBy: texto(registro.invitedBy),
    origin: "radar_specialist_consultation",
  };
}

/* ============================== o convite ============================= */

/**
 * O DEEP LINK — a única forma de o bot poder falar com alguém depois.
 *
 * O parâmetro `start` carrega SÓ o token opaco. Nome, marca, artigo e pauta
 * ficam no servidor, atrás do hash: o link é compartilhado por WhatsApp, e-mail
 * ou qualquer canal que o operador escolher, e qualquer coisa dentro dele viaja
 * por onde ninguém controla.
 */
export function radarSpecialistInviteLink(input: { botUsername: string | null; token: string }): string | null {
  const bot = (input.botUsername || "").trim().replace(/^@/, "");
  if (!bot || !input.token.trim()) return null;
  return `https://t.me/${bot}?start=${encodeURIComponent(input.token.trim())}`;
}

/**
 * A MENSAGEM QUE O OPERADOR COLA — curta, e sem prometer o que não sabe.
 *
 * Ela não diz quantos pontos existem nem qual é o artigo: quem recebe ainda não
 * aceitou revisar nada, e o conteúdo em preparação não é público. O detalhe
 * chega pelo bot, depois do `/start`.
 */
export function radarSpecialistInviteMessage(input: { link: string | null }): string {
  const corpo = [
    "Olá. Gostaria da sua contribuição profissional para revisar alguns pontos de um conteúdo em preparação.",
    "",
    "A revisão pode ser feita pelo Telegram:",
    input.link || "(link indisponível: o username do Bot ainda não foi confirmado no Admin)",
  ];
  return corpo.join("\n");
}

/* ===================== o estado do convite ===================== */

export const RADAR_SPECIALIST_INVITE_STATES = ["OPEN", "USED", "REVOKED", "EXPIRED", "NONE"] as const;
export type RadarSpecialistInviteState = typeof RADAR_SPECIALIST_INVITE_STATES[number];

export type RadarSpecialistOnboardingToken = {
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
};

/**
 * O CONVITE MAIS RECENTE DECIDE — e um convite aberto não é um link recuperável.
 *
 * `telegram_onboarding_tokens` guarda o HASH do token, nunca o token. Depois de
 * um F5, o servidor sabe que existe convite válido e não sabe qual é a URL: ela
 * só existiu uma vez, na resposta do POST que a criou.
 *
 * Por isso o estado não é `hasLink`. É `OPEN`, e a tela traduz isso em "gere um
 * link novo" — em vez de fazer o botão desaparecer, que foi o defeito de runtime
 * que o SPECIALIST_2.1.1 veio consertar.
 */
export function radarSpecialistInviteState(input: {
  tokens: readonly RadarSpecialistOnboardingToken[];
  connected: boolean;
  now?: Date;
}): RadarSpecialistInviteState {
  /* O vínculo ativo responde por si: quem entrou não depende mais de convite. */
  if (input.connected) return "USED";
  if (!input.tokens.length) return "NONE";

  const agora = (input.now || new Date()).getTime();
  const recentes = [...input.tokens].sort((esquerda, direita) => Date.parse(direita.createdAt) - Date.parse(esquerda.createdAt));

  if (recentes.some(item => item.usedAt)) return "USED";
  if (recentes.some(item => !item.revokedAt && Date.parse(item.expiresAt) > agora)) return "OPEN";
  if (recentes.every(item => item.revokedAt)) return "REVOKED";
  return "EXPIRED";
}

export const RADAR_SPECIALIST_INVITE_LABELS: Record<RadarSpecialistInviteState, string> = {
  OPEN: "Convite aberto · aguardando entrada no Telegram",
  USED: "Convite usado",
  REVOKED: "Convite revogado",
  EXPIRED: "Convite expirado",
  NONE: "Nenhum convite emitido",
};
