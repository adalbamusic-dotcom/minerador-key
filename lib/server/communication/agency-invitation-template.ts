export type CommunicationTemplateContent = {
  subject: string;
  text_body: string;
  html_body: string;
};

export const PUBLIC_FREE_TRIAL_REQUEST_RECEIVED = "PUBLIC_FREE_TRIAL_REQUEST_RECEIVED";
export const PUBLIC_FREE_TRIAL_APPROVED = "PUBLIC_FREE_TRIAL_APPROVED";
export const ADMIN_TRUSTED_INVITE = "ADMIN_TRUSTED_INVITE";

export const AGENCY_COMMUNICATION_PRESET_CODES = {
  publicFreeTrialRequestReceived: PUBLIC_FREE_TRIAL_REQUEST_RECEIVED,
  publicFreeTrialApproved: PUBLIC_FREE_TRIAL_APPROVED,
  adminTrustedInvite: ADMIN_TRUSTED_INVITE,
} as const;

export type AgencyCommunicationPresetCode = (typeof AGENCY_COMMUNICATION_PRESET_CODES)[keyof typeof AGENCY_COMMUNICATION_PRESET_CODES];

export const publicFreeTrialRequestReceivedTemplate: CommunicationTemplateContent = {
  subject: "Recebemos sua solicitação de teste do Minerador Key",
  text_body: "{{greeting}}\n\nRecebemos sua solicitação de teste do Minerador Key para a Agência {{agency_name}}.\n\nNossa equipe vai revisar os dados enviados. Você receberá outro e-mail quando a solicitação for aprovada.\n\nEsta solicitação não cria uma conta nem ativa a Agência.",
  html_body: "<p>{{greeting}}</p><p>Recebemos sua solicitação de teste do Minerador Key para a Agência <strong>{{agency_name}}</strong>.</p><p>Nossa equipe vai revisar os dados enviados. Você receberá outro e-mail quando a solicitação for aprovada.</p><p>Esta solicitação não cria uma conta nem ativa a Agência.</p>",
};

export const publicFreeTrialApprovedTemplate: CommunicationTemplateContent = {
  subject: "Seu teste grátis do Minerador Key foi aprovado",
  text_body: "{{greeting}}\n\nSeu teste grátis do Minerador Key para a Agência {{agency_name}} foi aprovado.\n\nO acesso é válido por {{trial_days}} dias, contados a partir da conclusão do cadastro e da ativação — não a partir da aprovação ou deste e-mail.\n\n{{cta_label}}: {{onboarding_url}}\n\nO link técnico é pessoal, de uso único e expira em {{technical_expires_at}}. Essa validade técnica é separada do período de acesso de {{trial_days}} dias.",
  html_body: "<p>{{greeting}}</p><p>Seu teste grátis do Minerador Key para a Agência <strong>{{agency_name}}</strong> foi aprovado.</p><p>O acesso é válido por <strong>{{trial_days}} dias</strong>, contados a partir da conclusão do cadastro e da ativação — não a partir da aprovação ou deste e-mail.</p><p><a href=\"{{onboarding_url}}\">{{cta_label}}</a></p><p>O link técnico é pessoal, de uso único e expira em {{technical_expires_at}}. Essa validade técnica é separada do período de acesso de {{trial_days}} dias.</p>",
};

export const adminTrustedInviteTemplate: CommunicationTemplateContent = {
  subject: "Você foi convidado para testar o Minerador Key",
  text_body: "{{greeting}}\n\nVocê recebeu um convite para configurar o acesso da Agência {{agency_name}} ao Minerador Key.\n\nResponsável: {{recipient_name}}\nAcesso de teste até {{access_expires_at}}.\n\n{{cta_label}}: {{onboarding_url}}\n\nO link técnico é pessoal, de uso único e expira em {{technical_expires_at}}. Essa validade técnica pode terminar antes do período de acesso definido para você.",
  html_body: "<p>{{greeting}}</p><p>Você recebeu um convite para configurar o acesso da Agência <strong>{{agency_name}}</strong> ao Minerador Key.</p><p><strong>Responsável:</strong> {{recipient_name}}</p><p>O acesso de teste fica disponível até <strong>{{access_expires_at}}</strong>.</p><p><a href=\"{{onboarding_url}}\">{{cta_label}}</a></p><p>O link técnico é pessoal, de uso único e expira em {{technical_expires_at}}. Essa validade técnica pode terminar antes do período de acesso definido para você.</p>",
};

const agencyCommunicationPresets: Record<AgencyCommunicationPresetCode, CommunicationTemplateContent> = {
  [AGENCY_COMMUNICATION_PRESET_CODES.publicFreeTrialRequestReceived]: publicFreeTrialRequestReceivedTemplate,
  [AGENCY_COMMUNICATION_PRESET_CODES.publicFreeTrialApproved]: publicFreeTrialApprovedTemplate,
  [AGENCY_COMMUNICATION_PRESET_CODES.adminTrustedInvite]: adminTrustedInviteTemplate,
};

export function resolveAgencyCommunicationPreset(code: string) {
  return agencyCommunicationPresets[code as AgencyCommunicationPresetCode] || null;
}

export function resolveAgencyInvitationPresetCode(source: string): AgencyCommunicationPresetCode {
  if (source === "PUBLIC_APPLICATION") return AGENCY_COMMUNICATION_PRESET_CODES.publicFreeTrialApproved;
  if (source === "ADMIN_INVITE") return AGENCY_COMMUNICATION_PRESET_CODES.adminTrustedInvite;
  throw new Error("COMMUNICATION_INVITATION_SOURCE_UNSUPPORTED");
}

export const canonicalAgencyInvitationTemplate: CommunicationTemplateContent = {
  subject: "Seu acesso à Agência {{agency_name}} no Minerador Key foi aprovado",
  text_body: "{{greeting}}\n\nSua solicitação de acesso à Agência {{agency_name}} foi aprovada no {{plan_name}}.\n\nUse o botão abaixo para concluir seu acesso ao Minerador Key.\n\n{{cta_label}}: {{onboarding_url}}\n\nEste convite é pessoal, de uso único e expira em {{expires_at}}.",
  html_body: "<p>{{greeting}}</p><p>Sua solicitação de acesso à Agência <strong>{{agency_name}}</strong> foi aprovada no {{plan_name}}.</p><p>Use o botão abaixo para concluir seu acesso ao Minerador Key.</p><p><a href=\"{{onboarding_url}}\">{{cta_label}}</a></p><p>Este convite é pessoal, de uso único e expira em {{expires_at}}.</p>",
};

export function resolveAgencyInvitationTemplate(template: CommunicationTemplateContent) {
  const hasCanonicalVariables = ["{{plan_name}}", "{{cta_label}}"].every((variable) =>
    template.subject.includes(variable) || template.text_body.includes(variable) || template.html_body.includes(variable),
  );
  return hasCanonicalVariables ? template : canonicalAgencyInvitationTemplate;
}

export function formatCommunicationPlanName(planCode: string) {
  const normalized = planCode.trim().toUpperCase();
  if (normalized === "FREE") return "Plano Free";
  const label = normalized.toLowerCase().replace(/(^|_)([a-z])/g, (_match, separator: string, character: string) => `${separator ? " " : ""}${character.toUpperCase()}`);
  return `Plano ${label}`;
}

export function formatInvitationExpiry(expiresAt: string) {
  const date = new Date(expiresAt);
  if (!Number.isFinite(date.getTime())) throw new Error("COMMUNICATION_INVITATION_EXPIRY_INVALID");
  return date.toLocaleDateString("pt-BR");
}
