import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("reinvite reutiliza o convite da application e nunca cai em nome ou primeiro registro", async () => {
  const [service, route] = await Promise.all([
    read("lib/server/agency-onboarding.ts"),
    read("app/api/admin/agency-applications/route.ts"),
  ]);
  const reinvite = service.slice(service.indexOf("export async function createInvitationForApprovedApplication"), service.indexOf("async function queueInvitationMessage"));
  assert.match(reinvite, /renewAgencyInvitation\(client, \{ applicationId, actorUserId: input\.actorUserId, origin: input\.origin \}\)/);
  assert.match(service, /ONBOARDING_INVITATION_NOT_FOUND/);
  assert.match(service, /ONBOARDING_INVITATION_ACCEPTED_TERMINAL/);
  assert.doesNotMatch(reinvite, /createDirectAgencyInvitation/);
  assert.doesNotMatch(reinvite, /eq\("destination_email"/);
  assert.doesNotMatch(reinvite, /eq\("proposed_agency_name"/);
  assert.match(route, /createInvitationForApprovedApplication/);
});

test("application, invitation e mensagem preservam a correlação técnica", async () => {
  const [service, messages, migration] = await Promise.all([
    read("lib/server/agency-onboarding.ts"),
    read("lib/server/communication/messages.ts"),
    read("supabase/migrations/0020_communication_transactional_minimum.sql"),
  ]);
  assert.match(service, /agencyApplicationId: applicationId/);
  assert.match(service, /agencyInvitationId: invitation\.id/);
  assert.match(service, /select\("id,application_id,destination_email,responsible_name,proposed_agency_name/);
  assert.match(service, /queueInvitationMessage\(client, result\.data, origin, result\.data\.application_id\)/);
  assert.match(messages, /p_agency_application_id: input\.agencyApplicationId/);
  assert.match(messages, /p_agency_invitation_id: input\.agencyInvitationId/);
  assert.match(migration, /agency_application_id uuid REFERENCES public\.agency_applications\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /agency_invitation_id uuid REFERENCES public\.agency_invitations\(id\) ON DELETE RESTRICT/);
});
