import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AGENCY_COMMUNICATION_PRESET_CODES,
  adminTrustedInviteTemplate,
  canonicalAgencyInvitationTemplate,
  formatCommunicationPlanName,
  formatInvitationExpiry,
  publicFreeTrialApprovedTemplate,
  publicFreeTrialRequestReceivedTemplate,
  resolveAgencyInvitationPresetCode,
  resolveAgencyInvitationTemplate,
} from "../lib/server/communication/agency-invitation-template.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("template de convite usa copy neutra e variáveis semânticas", () => {
  assert.match(canonicalAgencyInvitationTemplate.subject, /Agência \{\{agency_name\}\}/);
  assert.match(canonicalAgencyInvitationTemplate.text_body, /\{\{plan_name\}\}/);
  assert.match(canonicalAgencyInvitationTemplate.text_body, /\{\{cta_label\}\}/);
  assert.match(canonicalAgencyInvitationTemplate.html_body, /Concluir acesso|\{\{cta_label\}\}/);
  assert.doesNotMatch(canonicalAgencyInvitationTemplate.text_body, /Plano Free/);
  assert.doesNotMatch(canonicalAgencyInvitationTemplate.text_body, /Criar meu acesso/);
});

test("template persistido legado recebe a copy canônica sem tocar na infraestrutura", () => {
  const legacy = { subject: "legado", text_body: "{{greeting}} Plano Free", html_body: "<p>legado</p>" };
  assert.deepEqual(resolveAgencyInvitationTemplate(legacy), canonicalAgencyInvitationTemplate);
  assert.equal(resolveAgencyInvitationTemplate(canonicalAgencyInvitationTemplate), canonicalAgencyInvitationTemplate);
});

test("labels e expiração vêm dos campos semânticos do convite", () => {
  assert.equal(formatCommunicationPlanName("FREE"), "Plano Free");
  assert.equal(formatCommunicationPlanName("TEAM"), "Plano Team");
  assert.equal(formatInvitationExpiry("2026-08-17T12:00:00.000Z"), new Date("2026-08-17T12:00:00.000Z").toLocaleDateString("pt-BR"));
  assert.throws(() => formatInvitationExpiry("not-a-date"), /COMMUNICATION_INVITATION_EXPIRY_INVALID/);
});

test("dispatcher usa o convite real e preserva o fluxo hash-only", async () => {
  const [dispatcher, onboarding, onboardingPage, continueRoute, messages, migration] = await Promise.all([
    read("lib/server/communication/dispatcher.ts"),
    read("lib/server/agency-onboarding.ts"),
    read("app/onboarding/agencia/page.tsx"),
    read("app/api/onboarding/agency/continue/route.ts"),
    read("lib/server/communication/messages.ts"),
    read("supabase/migrations/0020_communication_transactional_minimum.sql"),
  ]);
  assert.match(dispatcher, /application_id,is_operational,status,responsible_name,proposed_agency_name,plan_code,expires_at/);
  assert.match(dispatcher, /recipientName = invitation\.data\.responsible_name/);
  assert.match(dispatcher, /agencyName = invitation\.data\.proposed_agency_name/);
  assert.match(dispatcher, /formatCommunicationPlanName\(invitation\.data\.plan_code\)/);
  assert.match(dispatcher, /formatInvitationExpiry\(invitation\.data\.expires_at\)/);
  assert.match(dispatcher, /cta_label: "Concluir acesso"/);
  assert.match(dispatcher, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(messages, /p_payload: input\.payload/);
  assert.doesNotMatch(onboarding, /token: token/);
  assert.match(migration, /token_hash text/);
  assert.doesNotMatch(migration, /raw_token|token_plaintext/i);
  assert.match(onboardingPage, /sessionStatus === "unauthenticated"/);
  assert.match(onboardingPage, /sessionStatus === "authenticated"/);
  assert.match(continueRoute, /const target = !identity/);
  assert.match(continueRoute, /\/login\?/);
  assert.match(continueRoute, /\/cadastro\?/);
});

test("copy não expõe variáveis técnicas e usa o mesmo CTA para os dois destinos", () => {
  const variables = [...canonicalAgencyInvitationTemplate.text_body.matchAll(/\{\{([a-z0-9_]+)\}\}/gi)].map((match) => match[1]);
  assert.deepEqual([...new Set(variables)].sort(), ["agency_name", "cta_label", "expires_at", "greeting", "onboarding_url", "plan_name"]);
  assert.match(canonicalAgencyInvitationTemplate.html_body, /href="\{\{onboarding_url\}\}"/);
  assert.match(canonicalAgencyInvitationTemplate.html_body, /\{\{cta_label\}\}/);
});

function render(template: { subject: string; text_body: string; html_body: string }, values: Record<string, string>) {
  const interpolate = (value: string) => value.replace(/\{\{([a-z0-9_]+)\}\}/gi, (_match, key: string) => values[key] || "");
  return {
    subject: interpolate(template.subject),
    text: interpolate(template.text_body),
    html: interpolate(template.html_body),
  };
}

test("presets de Agency usam a entidade e a origem corretas", () => {
  assert.equal(AGENCY_COMMUNICATION_PRESET_CODES.publicFreeTrialRequestReceived, "PUBLIC_FREE_TRIAL_REQUEST_RECEIVED");
  assert.equal(AGENCY_COMMUNICATION_PRESET_CODES.publicFreeTrialApproved, "PUBLIC_FREE_TRIAL_APPROVED");
  assert.equal(AGENCY_COMMUNICATION_PRESET_CODES.adminTrustedInvite, "ADMIN_TRUSTED_INVITE");
  assert.equal(resolveAgencyInvitationPresetCode("PUBLIC_APPLICATION"), AGENCY_COMMUNICATION_PRESET_CODES.publicFreeTrialApproved);
  assert.equal(resolveAgencyInvitationPresetCode("ADMIN_INVITE"), AGENCY_COMMUNICATION_PRESET_CODES.adminTrustedInvite);

  const publicRequest = render(publicFreeTrialRequestReceivedTemplate, {
    greeting: "Olá, Ada.",
    agency_name: "AdaSEO",
  });
  assert.match(publicRequest.subject, /^Recebemos sua .* de teste do Minerador Key$/);
  assert.match(publicRequest.text, /AdaSEO/);
  assert.match(publicRequest.text, /cria uma conta/);
  assert.doesNotMatch(publicRequest.text, /Concluir cadastro|onboarding_url/);

  const publicApproved = render(publicFreeTrialApprovedTemplate, {
    greeting: "Olá, Ada.",
    agency_name: "AdaSEO",
    trial_days: "30",
    cta_label: "Concluir cadastro",
    onboarding_url: "https://example.test/auth/new-slot",
    technical_expires_at: "20/08/2026",
  });
  assert.match(publicApproved.subject, /^Seu teste .* do Minerador Key foi aprovado$/);
  assert.match(publicApproved.text, /AdaSEO/);
  assert.match(publicApproved.text, /30 dias/);
  assert.match(publicApproved.text, /Concluir cadastro/);
  assert.match(publicApproved.text, /20\/08\/2026/);
  assert.match(publicApproved.html, /href="https:\/\/example\.test\/auth\/new-slot"/);
  assert.doesNotMatch(publicApproved.text, /acesso fica disponÃ­vel atÃ©|access_expires_at/);

  const trusted = render(adminTrustedInviteTemplate, {
    greeting: "Olá, Bruno.",
    agency_name: "Lindisse",
    recipient_name: "Bruno",
    access_expires_at: "30/09/2026",
    cta_label: "Concluir cadastro",
    onboarding_url: "https://example.test/auth/new-slot",
    technical_expires_at: "20/08/2026",
  });
  assert.match(trusted.subject, /^Voc.* foi convidado para testar o Minerador Key$/);
  assert.match(trusted.text, /Lindisse/);
  assert.match(trusted.text, /Responsável: Bruno/);
  assert.match(trusted.text, /configurar o acesso da Agência/);
  assert.match(trusted.text, /30\/09\/2026/);
  assert.match(trusted.text, /20\/08\/2026/);
  assert.match(trusted.text, /Concluir cadastro/);
  assert.doesNotMatch(trusted.text, /foi aprovado|aprovada/);
  assert.doesNotMatch(trusted.text, /pela Agência/);
  assert.doesNotMatch(trusted.text, /30 dias|trial_days/);
});

test("rotas mapeiam submissão pública e convite administrativo aos presets", async () => {
  const [publicRoute, onboarding, dispatcher] = await Promise.all([
    read("app/api/agency-applications/route.ts"),
    read("lib/server/agency-onboarding.ts"),
    read("lib/server/communication/dispatcher.ts"),
  ]);
  assert.match(publicRoute, /dispatchCommunicationMessage\(client, application\.message\.id\)/);
  assert.match(onboarding, /publicFreeTrialRequestReceived/);
  assert.match(onboarding, /resolveAgencyInvitationPresetCode\(invitation\.source\)/);
  assert.match(dispatcher, /recipientName = application\.data\.responsible_name/);
  assert.match(dispatcher, /access_expires_at/);
  assert.match(dispatcher, /trialDays = "30"/);
});
