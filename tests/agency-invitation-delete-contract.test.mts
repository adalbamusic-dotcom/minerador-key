import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("exclusão do convite direto é transacional, restrita e protege aceite e envio em curso", async () => {
  const migration = await read("supabase/migrations/20260914033459_delete_unaccepted_direct_agency_invitation.sql");
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = ''/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.delete_unaccepted_direct_agency_invitation\(uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.delete_unaccepted_direct_agency_invitation\(uuid\) TO service_role/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /invitation\.source <> 'ADMIN_INVITE'/);
  assert.match(migration, /invitation\.status = 'ACCEPTED'/);
  assert.match(migration, /agency_onboardings/);
  assert.match(migration, /agency_access_periods/);
  assert.match(migration, /status = 'SENDING'/);
  const events = migration.indexOf("DELETE FROM public.communication_delivery_events");
  const messages = migration.indexOf("DELETE FROM public.communication_messages");
  const tokens = migration.indexOf("DELETE FROM public.agency_invitation_token_generations");
  const invitation = migration.indexOf("DELETE FROM public.agency_invitations");
  assert.ok(events < messages && messages < tokens && tokens < invitation);
  assert.doesNotMatch(migration, /DELETE FROM (?:auth\.users|public\.agencies|public\.agency_applications)/);
});

test("API e Admin distinguem exclusão definitiva de revogação histórica", async () => {
  const [route, service, panel] = await Promise.all([
    read("app/api/admin/agency-invitations/route.ts"),
    read("lib/server/agency-onboarding.ts"),
    read("modules/admin/agencies-admin-panel.tsx"),
  ]);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /await requireCanonicalPlatformAdmin\(\)/);
  assert.match(service, /delete_unaccepted_direct_agency_invitation/);
  assert.match(service, /ONBOARDING_INVITATION_DELETE_UNCONFIRMED/);
  assert.match(panel, /Excluir convite definitivamente\?/);
  assert.match(panel, /Um e-mail já enviado permanece na caixa do destinatário/);
  assert.match(panel, /item\.source === "ADMIN_INVITE"/);
  assert.match(panel, /item\.source === "ADMIN_INVITE" && item\.status !== "ACCEPTED"/);
  assert.match(panel, /Revogar/);
});
