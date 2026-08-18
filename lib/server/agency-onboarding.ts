import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAgencyRef, normalizeAgencyRefSlug } from "@/lib/agency-routing";
import { isTenantId } from "@/lib/tenant-routing";
import { enqueueCommunicationMessage } from "@/lib/server/communication/messages";
import { AGENCY_COMMUNICATION_PRESET_CODES, resolveAgencyInvitationPresetCode } from "@/lib/server/communication/agency-invitation-template";
import { canonicalAgencyInvitationExpiry, classifyAgencyInvitationRenewal, resolveAgencyInvitationPolicy } from "@/lib/server/agency-invitation-lifecycle";

export class AgencyOnboardingError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const normalizedEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
const requiredText = (value: unknown, label: string, max = 160) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new AgencyOnboardingError(400, "ONBOARDING_INVALID_INPUT", `${label} é obrigatório.`);
  return value.trim();
};
const requiredUuid = (value: unknown, label: string) => {
  if (typeof value !== "string" || !isTenantId(value)) throw new AgencyOnboardingError(400, "ONBOARDING_INVALID_INPUT", `${label} é inválido.`);
  return value;
};
const requiredFutureAccessExpiry = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) throw new AgencyOnboardingError(400, "ONBOARDING_ACCESS_EXPIRY_INVALID", "Informe a validade do acesso.");
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date <= new Date()) throw new AgencyOnboardingError(400, "ONBOARDING_ACCESS_EXPIRY_INVALID", "A validade do acesso precisa estar no futuro.");
  return date;
};
const schemaNotApplied = (error: { code?: string; message?: string } | null | undefined) => error?.code === "42P01" || error?.code === "PGRST205" || /agency_applications|schema cache|relation .* does not exist/i.test(error?.message || "");
const applicationPersistenceError = (error: { code?: string; message?: string } | null | undefined) => {
  if (schemaNotApplied(error)) return new AgencyOnboardingError(503, "SCHEMA_NOT_APPLIED", "O recebimento de solicitações ainda não está disponível: a migration 0018_agency_onboarding.sql precisa ser aplicada manualmente.");
  return new AgencyOnboardingError(503, "AGENCY_APPLICATION_UNAVAILABLE", "Não foi possível registrar a solicitação.");
};
const lifecycleSchemaNotApplied = (error: { code?: string; message?: string } | null | undefined) =>
  error?.code === "PGRST202" || /renew_agency_invitation|is_operational|function .* does not exist/i.test(error?.message || "");
const accessPeriodSchemaNotApplied = (error: { code?: string; message?: string } | null | undefined) =>
  error?.code === "PGRST202" || /complete_agency_onboarding_(with_access|authenticated_with_access)|agency_access_periods|function .* does not exist/i.test(error?.message || "");
const trustedInviteSchemaNotApplied = (error: { code?: string; message?: string } | null | undefined) =>
  error?.code === "PGRST202" || /complete_agency_onboarding_with_confirmed_agency_name|function .* does not exist/i.test(error?.message || "");

async function queuePublicTrialRequestMessage(client: SupabaseClient, application: {
  id: string;
  destination_email: string;
  responsible_name: string;
  proposed_agency_name: string;
}) {
  return enqueueCommunicationMessage(client, {
    // 0020 only permits the two existing message types. The preset code is
    // the explicit discriminator for this additive communication contract.
    messageType: "AGENCY_WELCOME",
    templateCode: AGENCY_COMMUNICATION_PRESET_CODES.publicFreeTrialRequestReceived,
    templateVersion: 1,
    destination: application.destination_email,
    payload: {
      applicationId: application.id,
      responsibleName: application.responsible_name,
      agencyName: application.proposed_agency_name,
    },
    idempotencyKey: `public-free-trial-request:${application.id}`,
    agencyApplicationId: application.id,
  });
}

function onboardingCompletionError(error: { code?: string; message?: string } | null | undefined): AgencyOnboardingError {
  if (accessPeriodSchemaNotApplied(error)) return new AgencyOnboardingError(503, "SCHEMA_0037_NOT_APPLIED", "A fundação de acesso da Agency ainda não está disponível: a migration 0037 precisa ser aplicada manualmente.");
  const message = error?.message || "";
  if (/AGENCY_ONBOARDING_ACCESS_EXPIRED/i.test(message)) return new AgencyOnboardingError(409, "ONBOARDING_ACCESS_EXPIRED", "O período de acesso deste convite já expirou.");
  if (/AGENCY_ONBOARDING_ACCESS_INCOMPLETE/i.test(message)) return new AgencyOnboardingError(409, "ONBOARDING_ACCESS_INCOMPLETE", "O onboarding anterior não possui uma fundação de acesso completa.");
  if (/AGENCY_ONBOARDING_IDEMPOTENCY_CONFLICT/i.test(message)) return new AgencyOnboardingError(409, "ONBOARDING_IDEMPOTENCY_CONFLICT", "Esta operação já pertence a outra identidade.");
  if (/AGENCY_ONBOARDING_OWNER_ALREADY_ASSIGNED/i.test(message)) return new AgencyOnboardingError(409, "ONBOARDING_OWNER_ALREADY_ASSIGNED", "Esta identidade já possui uma Agency operacional.");
  if (/AGENCY_ONBOARDING_INVITATION_FORBIDDEN/i.test(message)) return new AgencyOnboardingError(403, "ONBOARDING_INVITATION_FORBIDDEN", "Este convite não pertence a esta identidade.");
  if (/AGENCY_ONBOARDING_TOKEN_INVALID/i.test(message)) return new AgencyOnboardingError(409, "ONBOARDING_TOKEN_INVALID", "Este token não é válido para concluir o convite.");
  return new AgencyOnboardingError(409, "ONBOARDING_COMPLETE_FAILED", "Não foi possível concluir o onboarding da agência.");
}
export async function createPublicAgencyApplication(client: SupabaseClient, input: { agencyName: unknown; responsibleName: unknown; destinationEmail: unknown; websiteUrl?: unknown; approximateBrandCount?: unknown; idempotencyKey: unknown }) {
  const proposedAgencyName = requiredText(input.agencyName, "O nome da agência");
  const responsibleName = requiredText(input.responsibleName, "O nome do responsável");
  const destinationEmail = normalizedEmail(input.destinationEmail);
  if (!/^\S+@\S+\.\S+$/.test(destinationEmail)) throw new AgencyOnboardingError(400, "ONBOARDING_INVALID_INPUT", "Informe um e-mail válido.");
  const idempotencyKey = requiredUuid(input.idempotencyKey, "A solicitação");
  const websiteUrl = typeof input.websiteUrl === "string" && input.websiteUrl.trim() ? input.websiteUrl.trim() : null;
  if (websiteUrl) { try { new URL(websiteUrl); } catch { throw new AgencyOnboardingError(400, "ONBOARDING_INVALID_INPUT", "Informe um site válido."); } }
  const approximateBrandCount = input.approximateBrandCount === undefined || input.approximateBrandCount === "" ? null : Number(input.approximateBrandCount);
  if (approximateBrandCount !== null && (!Number.isInteger(approximateBrandCount) || approximateBrandCount < 1 || approximateBrandCount > 100000)) throw new AgencyOnboardingError(400, "ONBOARDING_INVALID_INPUT", "Informe uma quantidade de marcas válida.");
  const existing = await client.from("agency_applications").select("id,status,destination_email,responsible_name,proposed_agency_name").eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing.error) throw applicationPersistenceError(existing.error);
  if (existing.data) {
    const message = await queuePublicTrialRequestMessage(client, existing.data);
    return { id: existing.data.id, status: existing.data.status, replayed: true, message };
  }
  const created = await client.from("agency_applications").insert({ proposed_agency_name: proposedAgencyName, responsible_name: responsibleName, destination_email: destinationEmail, website_url: websiteUrl, approximate_brand_count: approximateBrandCount, plan_code: "FREE", idempotency_key: idempotencyKey }).select("id,status,destination_email,responsible_name,proposed_agency_name").single();
  if (created.error || !created.data) {
    if (created.error?.code === "23505") return createPublicAgencyApplication(client, input);
    throw applicationPersistenceError(created.error);
  }
  const message = await queuePublicTrialRequestMessage(client, created.data);
  return { id: created.data.id, status: created.data.status, replayed: false, message };
}

export async function listAgencyApplications(client: SupabaseClient) {
  const result = await client.from("agency_applications").select("id,proposed_agency_name,responsible_name,destination_email,website_url,approximate_brand_count,plan_code,status,created_at").order("created_at", { ascending: false });
  if (result.error) throw new AgencyOnboardingError(503, "AGENCY_APPLICATION_LIST_FAILED", "Não foi possível carregar as solicitações.");
  const applications = result.data || [];
  const invitations = await client.from("agency_invitations").select("application_id,destination_email,proposed_agency_name,status,expires_at,is_operational").in("status", ["PENDING", "EXPIRED"]);
  if (invitations.error) throw new AgencyOnboardingError(503, "AGENCY_APPLICATION_LIST_FAILED", "Não foi possível confirmar o estado dos convites.");
  return applications.map((application) => ({
    ...application,
    hasActiveInvitation: (invitations.data || []).some((invitation) =>
      invitation.application_id === application.id &&
      invitation.is_operational === true &&
      invitation.status === "PENDING" && new Date(invitation.expires_at) > new Date(),
    ),
  }));
}

export async function createInvitationForApprovedApplication(client: SupabaseClient, input: { applicationId: unknown; actorUserId: string; expiresAt: unknown; origin: string }) {
  const applicationId = requiredUuid(input.applicationId, "A solicitação");
  const application = await client.from("agency_applications").select("id,status,destination_email,responsible_name,proposed_agency_name").eq("id", applicationId).maybeSingle();
  if (application.error || !application.data) throw new AgencyOnboardingError(404, "AGENCY_APPLICATION_NOT_FOUND", "A solicitação não foi encontrada.");
  if (application.data.status !== "APPROVED") throw new AgencyOnboardingError(409, "AGENCY_APPLICATION_NOT_APPROVED", "Somente solicitações aprovadas podem gerar novo convite.");
  return renewAgencyInvitation(client, { applicationId, actorUserId: input.actorUserId, origin: input.origin });
}

async function queueInvitationMessage(client: SupabaseClient, invitation: { id: string; destination_email: string; responsible_name: string; proposed_agency_name: string; expires_at: string; source: string; access_expires_at?: string | null; communication_generation?: number }, origin: string, applicationId?: string | null) {
  if (!origin) throw new AgencyOnboardingError(500, "ONBOARDING_ORIGIN_MISSING", "Não foi possível preparar o destino seguro do convite.");
  return enqueueCommunicationMessage(client, {
    messageType: "AGENCY_INVITATION",
    templateCode: resolveAgencyInvitationPresetCode(invitation.source),
    templateVersion: 1,
    destination: invitation.destination_email,
    payload: {
      invitationId: invitation.id,
      responsibleName: invitation.responsible_name,
      agencyName: invitation.proposed_agency_name,
      technicalExpiresAt: invitation.expires_at,
      accessExpiresAt: invitation.access_expires_at || null,
      origin,
    },
    idempotencyKey: `agency_invitation:${invitation.id}:generation:${invitation.communication_generation || 0}`,
    agencyApplicationId: applicationId || null,
    agencyInvitationId: invitation.id,
  });
}

async function renewAgencyInvitation(client: SupabaseClient, input: { applicationId: string; actorUserId: string; origin: string }) {
  if (!input.origin) throw new AgencyOnboardingError(500, "ONBOARDING_ORIGIN_MISSING", "Não foi possível preparar o destino seguro do convite.");
  const now = new Date();
  const policy = resolveAgencyInvitationPolicy();
  const policyExpiresAt = canonicalAgencyInvitationExpiry(now, policy);
  const result = await client.rpc("renew_agency_invitation", {
    p_application_id: input.applicationId,
    p_actor_user_id: input.actorUserId,
    p_policy_expires_at: policyExpiresAt,
    p_successor_expires_at: policyExpiresAt,
    p_token_hash: hashToken(randomBytes(32).toString("hex")),
    p_origin: input.origin,
  });
  if (result.error) {
    if (lifecycleSchemaNotApplied(result.error)) throw new AgencyOnboardingError(503, "SCHEMA_0023_NOT_APPLIED", "O lifecycle de sucessão ainda não está disponível: a migration 0023 precisa ser aplicada manualmente.");
    const message = result.error.message || "";
    if (/ACCEPTED_TERMINAL/i.test(message)) throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_ACCEPTED_TERMINAL", "Este convite já foi aceito e é terminal; não pode ser reutilizado nem renovado.");
    if (/CURRENT_NOT_FOUND/i.test(message)) throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_NOT_FOUND", "A solicitação aprovada não possui um convite operacional canônico.");
    throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_RENEWAL_FAILED", "Não foi possível renovar o convite da solicitação.");
  }
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row?.invitation_id || !row?.communication_message_id) throw new AgencyOnboardingError(503, "ONBOARDING_INVITATION_RENEWAL_FAILED", "A renovação não retornou a correlação do convite e da mensagem.");
  const invitation = await client.from("agency_invitations").select("id,application_id,destination_email,responsible_name,proposed_agency_name,plan_code,expires_at,access_expires_at,status,source,communication_generation").eq("id", row.invitation_id).single();
  if (invitation.error || !invitation.data) throw new AgencyOnboardingError(503, "ONBOARDING_INVITATION_RENEWAL_FAILED", "A renovação foi concluída, mas o convite não pôde ser confirmado.");
  return {
    invitation: invitation.data,
    message: { id: row.communication_message_id as string, status: (row.message_status || "QUEUED") as "QUEUED" },
    renewalAction: row.renewal_action as "REUSE_CURRENT_INVITATION" | "CREATE_SUCCESSOR_INVITATION",
  };
}

export async function createDirectAgencyInvitation(client: SupabaseClient, input: { actorUserId: string; destinationEmail: unknown; responsibleName: unknown; agencyName: unknown; accessExpiresAt: unknown; origin: string }) {
  const destinationEmail = normalizedEmail(input.destinationEmail);
  if (!/^\S+@\S+\.\S+$/.test(destinationEmail)) throw new AgencyOnboardingError(400, "ONBOARDING_INVALID_INPUT", "Informe um e-mail válido.");
  const proposedAgencyName = requiredText(input.agencyName, "O nome da agência");
  const responsibleName = requiredText(input.responsibleName, "O nome do responsável");
  const accessExpiresAt = requiredFutureAccessExpiry(input.accessExpiresAt);
  const expiresAt = new Date(canonicalAgencyInvitationExpiry());
  const existing = await client.from("agency_invitations").select("id").eq("destination_email", destinationEmail).eq("proposed_agency_name", proposedAgencyName).eq("source", "ADMIN_INVITE").eq("status", "PENDING").limit(1);
  if (existing.error) throw new AgencyOnboardingError(503, "ONBOARDING_INVITATION_LOOKUP_FAILED", "Não foi possível verificar convites ativos.");
  if (existing.data?.length) throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_ALREADY_PENDING", "Já existe um convite pendente para este destinatário e agência.");
  const result = await client.from("agency_invitations").insert({ destination_email: destinationEmail, responsible_name: responsibleName, proposed_agency_name: proposedAgencyName, plan_code: "FREE", source: "ADMIN_INVITE", invited_by_actor_user_id: input.actorUserId, expires_at: expiresAt.toISOString(), access_expires_at: accessExpiresAt.toISOString(), token_hash: hashToken(randomBytes(32).toString("hex")) }).select("id,destination_email,responsible_name,proposed_agency_name,plan_code,expires_at,access_expires_at,status,source,communication_generation").single();
  if (result.error || !result.data) throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_CREATE_FAILED", "Não foi possível registrar o convite.");
  const message = await queueInvitationMessage(client, result.data, input.origin);
  return { invitation: result.data, message };
}

export async function approveAgencyApplication(client: SupabaseClient, input: { applicationId: unknown; actorUserId: string; expiresAt: unknown; origin: string }) {
  const applicationId = requiredUuid(input.applicationId, "A solicitação");
  const expiresAt = new Date(canonicalAgencyInvitationExpiry());
  const result = await client.rpc("approve_agency_application", { p_application_id: applicationId, p_actor_user_id: input.actorUserId, p_token_hash: hashToken(randomBytes(32).toString("hex")), p_expires_at: expiresAt.toISOString() });
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (result.error || !row?.invitation_id) throw new AgencyOnboardingError(409, "AGENCY_APPLICATION_APPROVE_FAILED", "Não foi possível aprovar a solicitação.");
  const invitation = await client.from("agency_invitations").select("id,destination_email,responsible_name,proposed_agency_name,plan_code,expires_at,access_expires_at,status,source,communication_generation").eq("id", row.invitation_id).single();
  if (invitation.error || !invitation.data) throw new AgencyOnboardingError(409, "AGENCY_APPLICATION_APPROVE_FAILED", "A aprovação foi concluída, mas o convite não pôde ser confirmado.");
  const message = await queueInvitationMessage(client, invitation.data, input.origin, applicationId);
  return { invitation: invitation.data, message };
}

export async function rejectAgencyApplication(client: SupabaseClient, input: { applicationId: unknown; actorUserId: string }) {
  const applicationId = requiredUuid(input.applicationId, "A solicitação");
  const result = await client.from("agency_applications").update({ status: "REJECTED", reviewed_by_actor_user_id: input.actorUserId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", applicationId).eq("status", "PENDING").select("id").maybeSingle();
  if (result.error || !result.data) throw new AgencyOnboardingError(409, "AGENCY_APPLICATION_REJECT_FAILED", "Esta solicitação não está disponível para rejeição.");
}

export async function listAgencyInvitations(client: SupabaseClient) {
  const result = await client.from("agency_invitations").select("id,application_id,is_operational,proposed_agency_name,plan_code,source,expires_at,access_expires_at,status,created_at,agency_id,communication_generation").order("created_at", { ascending: false });
  if (result.error) throw new AgencyOnboardingError(503, "ONBOARDING_INVITATION_LIST_FAILED", "Não foi possível carregar os convites.");
  return (result.data || []).map((invitation) => ({ ...invitation, isOperational: invitation.is_operational, status: invitation.status === "PENDING" && new Date(invitation.expires_at) <= new Date() ? "EXPIRED" : invitation.status }));
}

export async function revokeAgencyInvitation(client: SupabaseClient, invitationId: unknown) {
  const id = requiredUuid(invitationId, "O convite");
  const result = await client.from("agency_invitations").update({ status: "REVOKED", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "PENDING").select("id").maybeSingle();
  if (result.error || !result.data) throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_REVOKE_FAILED", "Este convite não está disponível para revogação.");
  const generations = await client.rpc("revoke_agency_invitation_token_generations", { p_invitation_id: id });
  if (generations.error) throw new AgencyOnboardingError(503, "ONBOARDING_INVITATION_REVOKE_FAILED", "As geraÃ§Ãµes de token nÃ£o puderam ser atualizadas.");
}

export async function rotateAgencyInvitation(client: SupabaseClient, invitationId: unknown, origin: string, actorUserId = "") {
  const id = requiredUuid(invitationId, "O convite");
  const current = await client.from("agency_invitations").select("id,application_id,status,expires_at,communication_generation").eq("id", id).maybeSingle();
  if (current.error || !current.data) throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_ROTATE_FAILED", "Este convite não está disponível para gerar um novo link.");
  if (current.data.application_id) return renewAgencyInvitation(client, { applicationId: current.data.application_id, actorUserId, origin });
  if (classifyAgencyInvitationRenewal({ status: current.data.status, expiresAt: current.data.expires_at }) === "CREATE_SUCCESSOR_INVITATION") {
    throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_NOT_ROTATABLE", "Este convite direto não pode ser renovado porque sua validade não segue a política atual.");
  }
  const currentExpiry = new Date(current.data.expires_at);
  const expiresAt = currentExpiry;
  const generation = typeof current.data.communication_generation === "number" ? current.data.communication_generation + 1 : 1;
  const result = await client.from("agency_invitations").update({ expires_at: expiresAt.toISOString(), status: "PENDING", communication_generation: generation, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "PENDING").select("id,application_id,destination_email,responsible_name,proposed_agency_name,plan_code,expires_at,access_expires_at,status,source,communication_generation").maybeSingle();
  if (result.error || !result.data) throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_ROTATE_FAILED", "Este convite não está disponível para gerar um novo link.");
  const message = await queueInvitationMessage(client, result.data, origin, result.data.application_id);
  return { invitation: result.data, message };
}

export async function inspectAgencyInvitation(client: SupabaseClient, token: unknown) {
  if (typeof token !== "string" || token.length < 32) throw new AgencyOnboardingError(404, "ONBOARDING_INVITATION_INVALID", "Convite inválido.");
  const tokenHash = hashToken(token);
  const generation = await client.from("agency_invitation_token_generations").select("invitation_id,expires_at,used_at,revoked_at").eq("token_hash", tokenHash).maybeSingle();
  if (!generation.error && generation.data && !generation.data.used_at && !generation.data.revoked_at && new Date(generation.data.expires_at) > new Date()) {
    const generatedInvitation = await client.from("agency_invitations").select("id,application_id,is_operational,proposed_agency_name,destination_email,responsible_name,plan_code,source,access_expires_at,expires_at,status").eq("id", generation.data.invitation_id).maybeSingle();
    if (!generatedInvitation.error && generatedInvitation.data && (!generatedInvitation.data.application_id || generatedInvitation.data.is_operational)) {
      const invitation = generatedInvitation.data;
      const status = invitation.status === "PENDING" && new Date(invitation.expires_at) <= new Date() ? "EXPIRED" : invitation.status;
      return { ...invitation, status };
    }
  }
  const result = await client.from("agency_invitations").select("id,application_id,is_operational,proposed_agency_name,destination_email,responsible_name,plan_code,source,access_expires_at,expires_at,status").eq("token_hash", tokenHash).maybeSingle();
  if (!result.error && result.data?.application_id && !result.data.is_operational) throw new AgencyOnboardingError(404, "ONBOARDING_INVITATION_INVALID", "Convite inválido.");
  if (result.error || !result.data) throw new AgencyOnboardingError(404, "ONBOARDING_INVITATION_INVALID", "Convite inválido.");
  const invitation = result.data;
  const status = invitation.status === "PENDING" && new Date(invitation.expires_at) <= new Date() ? "EXPIRED" : invitation.status;
  return { ...invitation, status };
}

export async function resolveInvitedAccountCreationContext(client: SupabaseClient, token: unknown) {
  const invitation = await inspectAgencyInvitation(client, token);
  if (invitation.status !== "PENDING" || !Number.isFinite(Date.parse(invitation.expires_at)) || Date.parse(invitation.expires_at) <= Date.now()) {
    throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_UNAVAILABLE", "Este convite não está disponível.");
  }

  if (invitation.source === "PUBLIC_APPLICATION") {
    if (!invitation.application_id || invitation.is_operational !== true) {
      throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_UNAVAILABLE", "Este convite não está disponível.");
    }
    const application = await client.from("agency_applications").select("status").eq("id", invitation.application_id).maybeSingle();
    if (application.error || application.data?.status !== "APPROVED") {
      throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_UNAVAILABLE", "A aprovação da solicitação não está disponível.");
    }
  } else if (invitation.source === "ADMIN_INVITE") {
    if (!invitation.access_expires_at || !Number.isFinite(Date.parse(invitation.access_expires_at)) || Date.parse(invitation.access_expires_at) <= Date.now()) {
      throw new AgencyOnboardingError(409, "ONBOARDING_ACCESS_EXPIRED", "O período de acesso deste convite já expirou.");
    }
  } else {
    throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_SOURCE_INVALID", "A origem deste convite não é suportada.");
  }

  const email = normalizedEmail(invitation.destination_email);
  const responsibleName = requiredText(invitation.responsible_name, "O responsável");
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_INVALID", "O convite não possui um destinatário válido.");
  }

  return { invitation, email, responsibleName };
}

function trustedInviteCompletionError(error: { code?: string; message?: string } | null | undefined): AgencyOnboardingError {
  if (trustedInviteSchemaNotApplied(error)) return new AgencyOnboardingError(503, "SCHEMA_0039_NOT_APPLIED", "A confirmação do nome da Agency ainda não está disponível: a migration 0039 precisa ser aplicada manualmente.");
  return onboardingCompletionError(error);
}

export async function completeAgencyOnboarding(client: SupabaseClient, input: { idempotencyKey: unknown; ownerUserId: string; invitationId: unknown; agencyName: string; token: unknown }) {
  const idempotencyKey = requiredUuid(input.idempotencyKey, "A operação");
  const invitationId = requiredUuid(input.invitationId, "O convite");
  const token = requiredText(input.token, "O token", 512);
  const agencySlug = normalizeAgencyRefSlug(input.agencyName);
  if (!agencySlug) throw new AgencyOnboardingError(400, "ONBOARDING_INVALID_INPUT", "O nome não produz uma referência válida.");
  const result = await client.rpc("complete_agency_onboarding_with_access", { p_idempotency_key: idempotencyKey, p_owner_user_id: input.ownerUserId, p_invitation_id: invitationId, p_agency_slug: agencySlug, p_token_hash: hashToken(token) });
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (result.error || !row?.agency_id || !row.agency_name || !row.access_period_id) throw onboardingCompletionError(result.error);
  return { agencyId: row.agency_id as string, agencyRef: buildAgencyRef(row.agency_name as string, row.agency_id as string), accessPeriodId: row.access_period_id as string, accessOrigin: row.access_origin as string, accessStartsAt: row.access_starts_at as string, accessEndsAt: row.access_ends_at as string | null };
}

export async function completeAgencyOnboardingWithConfirmedAgencyName(client: SupabaseClient, input: { idempotencyKey: unknown; ownerUserId: string; invitationId: unknown; confirmedAgencyName: unknown; token: unknown }) {
  const idempotencyKey = requiredUuid(input.idempotencyKey, "A operação");
  const invitationId = requiredUuid(input.invitationId, "O convite");
  const token = requiredText(input.token, "O token", 512);
  const confirmedAgencyName = requiredText(input.confirmedAgencyName, "O nome da agência");
  const agencySlug = normalizeAgencyRefSlug(confirmedAgencyName);
  if (!agencySlug) throw new AgencyOnboardingError(400, "ONBOARDING_INVALID_INPUT", "O nome não produz uma referência válida.");
  const result = await client.rpc("complete_agency_onboarding_with_confirmed_agency_name", {
    p_idempotency_key: idempotencyKey,
    p_owner_user_id: input.ownerUserId,
    p_invitation_id: invitationId,
    p_agency_slug: agencySlug,
    p_token_hash: hashToken(token),
    p_confirmed_agency_name: confirmedAgencyName,
  });
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (result.error || !row?.agency_id || !row.agency_name || !row.access_period_id) throw trustedInviteCompletionError(result.error);
  return { agencyId: row.agency_id as string, agencyName: row.agency_name as string, agencyRef: buildAgencyRef(row.agency_name as string, row.agency_id as string), accessPeriodId: row.access_period_id as string, accessOrigin: row.access_origin as string, accessStartsAt: row.access_starts_at as string, accessEndsAt: row.access_ends_at as string | null };
}

/**
 * Authenticated resumption path. The caller must resolve the invitation from
 * the current server session before invoking this canonical RPC.
 */
export async function completeAgencyOnboardingForAuthenticatedActor(client: SupabaseClient, input: { idempotencyKey: unknown; ownerUserId: string; invitationId: unknown; agencyName: string }) {
  const idempotencyKey = requiredUuid(input.idempotencyKey, "A operação");
  const invitationId = requiredUuid(input.invitationId, "O convite");
  const agencySlug = normalizeAgencyRefSlug(input.agencyName);
  if (!agencySlug) throw new AgencyOnboardingError(400, "ONBOARDING_INVALID_INPUT", "O nome não produz uma referência válida.");
  const result = await client.rpc("complete_agency_onboarding_authenticated_with_access", {
    p_idempotency_key: idempotencyKey,
    p_owner_user_id: input.ownerUserId,
    p_invitation_id: invitationId,
    p_agency_slug: agencySlug,
  });
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (result.error || !row?.agency_id || !row.agency_name || !row.access_period_id) throw onboardingCompletionError(result.error);
  return { agencyId: row.agency_id as string, agencyRef: buildAgencyRef(row.agency_name as string, row.agency_id as string), accessPeriodId: row.access_period_id as string, accessOrigin: row.access_origin as string, accessStartsAt: row.access_starts_at as string, accessEndsAt: row.access_ends_at as string | null };
}
