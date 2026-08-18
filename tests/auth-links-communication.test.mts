import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("recovery preferencial permanece pessoal e usa Supabase Auth", async () => {
  const [recovery, route, service] = await Promise.all([
    read("app/recuperar-senha/page.tsx"),
    read("app/api/admin/agencies/route.ts"),
    read("lib/server/communication/service.ts"),
  ]);
  assert.match(recovery, /resetPasswordForEmail/);
  assert.match(recovery, /updateUser\(\{ password \}\)/);
  assert.match(route, /AGENCY_ADMIN_LEGACY_ACCESS_FLOW_RETIRED/);
  assert.doesNotMatch(route, /generateSupabaseAuthLink/);
  assert.doesNotMatch(service, /sendAgencyRecovery|sendAgencyAccess/);
});

test("convite não expõe token e separa cadastro público da criação convidada", async () => {
  const [panel, route, signup, invitedRoute, continuation] = await Promise.all([
    read("modules/admin/agencies-admin-panel.tsx"),
    read("app/api/admin/agency-invitations/route.ts"),
    read("app/cadastro/page.tsx"),
    read("app/api/auth/invited-signup/route.ts"),
    read("app/api/onboarding/agency/continue/route.ts"),
  ]);
  assert.doesNotMatch(panel, /inviteLink|temporaryAccessLink|recoveryLink|Copiar link/);
  assert.doesNotMatch(route, /inviteLink|token_hash/);
  assert.match(signup, /auth\.signUp/);
  assert.match(signup, /autoComplete="username"/);
  assert.match(invitedRoute, /resolveInvitedAccountCreationContext/);
  assert.match(invitedRoute, /email_confirm: true/);
  assert.doesNotMatch(invitedRoute, /resendSignupConfirmation/);
  assert.doesNotMatch(signup, /generate_signup_link|generateSupabaseAuthLink/);
  assert.match(continuation, /findAuthUserByEmail/);
  assert.match(continuation, /invited_identity_pending_confirmation/);
  assert.doesNotMatch(continuation, /inviteEmail/);
  assert.doesNotMatch(continuation, /users.*enumeration|identity_count/);
});

test("links Auth auxiliares não persistem segredo nem usam storage do navegador", async () => {
  const [helper, route, service] = await Promise.all([
    read("lib/server/supabase-auth-links.ts"),
    read("app/api/admin/agencies/route.ts"),
    read("lib/server/communication/service.ts"),
  ]);
  assert.doesNotMatch(helper, /insert|update|localStorage|indexedDB|console\.(log|info|error)/);
  assert.doesNotMatch(route, /console\.(log|info|error)/);
  assert.doesNotMatch(service, /console\.(log|info|error)/);
});
