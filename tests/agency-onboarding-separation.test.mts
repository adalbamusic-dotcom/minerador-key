import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("onboarding não cria o papel global de Admin", async () => {
  const [migration, route] = await Promise.all([read("supabase/migrations/0018_agency_onboarding.sql"), read("app/api/onboarding/agency/route.ts")]);
  assert.doesNotMatch(migration + route, /public\.perfis|perfis\.role/);
  assert.match(route, /requireSupabaseUser/);
});

test("cadastro público e criação convidada continuam separados até o aceite autenticado", async () => {
  const [signup, invitedRoute, invitePage, continuation, onboarding] = await Promise.all([
    read("app/cadastro/page.tsx"),
    read("app/api/auth/invited-signup/route.ts"),
    read("app/onboarding/agencia/page.tsx"),
    read("app/api/onboarding/agency/continue/route.ts"),
    read("app/api/onboarding/agency/route.ts"),
  ]);
  assert.match(signup, /auth\.signUp/);
  assert.match(signup, /inviteToken/);
  assert.match(signup, /Criar sua conta/);
  assert.match(invitedRoute, /auth\.admin\.createUser/);
  assert.match(invitedRoute, /email_confirm: true/);
  assert.match(invitedRoute, /signInWithPassword/);
  assert.doesNotMatch(invitedRoute, /body\?\.email|body\?\.name/);
  assert.match(invitePage, /Continuar com este convite/);
  assert.match(continuation, /findAuthUserByEmail/);
  assert.match(continuation, /inviteToken/);
  assert.match(onboarding, /completeAgencyOnboarding/);
  assert.match(onboarding, /AGENCY_WELCOME/);
  assert.doesNotMatch(onboarding, /generate_signup_link|generateSupabaseAuthLink/);
});

test("Admin mostra apenas o estado da fila, nunca o token do convite", async () => {
  const [panel, invitationRoute, agencyRoute] = await Promise.all([
    read("modules/admin/agencies-admin-panel.tsx"),
    read("app/api/admin/agency-invitations/route.ts"),
    read("app/api/admin/agencies/route.ts"),
  ]);
  assert.match(panel, /Mensagem persistida na fila durável/);
  assert.match(panel, /Acesso: \{agency\.accessStatus/);
  assert.doesNotMatch(panel, /inviteLink|temporaryAccessLink|recoveryLink|token_hash/);
  assert.doesNotMatch(invitationRoute, /inviteLink|token_hash/);
  assert.match(agencyRoute, /AGENCY_ADMIN_LEGACY_ACCESS_FLOW_RETIRED/);
});

test("onboarding preserva owner sem membership implícito", async () => {
  const migration = await read("supabase/migrations/0018_agency_onboarding.sql");
  const functionBody = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.complete_agency_onboarding"));
  assert.match(functionBody, /owner_user_id/);
  assert.match(functionBody, /INSERT INTO public\.agencies/);
  assert.doesNotMatch(functionBody, /agency_memberships/);
  assert.doesNotMatch(functionBody, /brand_memberships/);
});

test("trusted invite confirma a Agency existente no convite antes do aceite", async () => {
  const [panel, onboarding, signup, invitedSignup, continuation, migration, template] = await Promise.all([
    read("modules/admin/agencies-admin-panel.tsx"),
    read("app/onboarding/agencia/page.tsx"),
    read("app/cadastro/page.tsx"),
    read("app/api/auth/invited-signup/route.ts"),
    read("app/api/onboarding/agency/continue/route.ts"),
    read("supabase/migrations/0037_agency_access_periods.sql"),
    read("lib/server/communication/agency-invitation-template.ts"),
  ]);
  assert.match(panel, /Agência ou empresa/);
  assert.match(panel, /Plano.*Free/);
  assert.match(panel, /Validade do acesso/);
  assert.match(onboarding, /source: "ADMIN_INVITE"/);
  assert.match(onboarding, /trustedInviteNeedsAuthentication/);
  assert.match(onboarding, /window\.location\.replace\(`\/api\/onboarding\/agency\/continue/);
  assert.match(onboarding, /Confirmar sua Agência/);
  assert.match(onboarding, /Responsável/);
  assert.match(onboarding, /E-mail de acesso/);
  assert.match(onboarding, /Acesso de teste até/);
  assert.match(onboarding, /Confirmar e criar Agência/);
  assert.match(onboarding, /proposed_agency_name/);
  assert.doesNotMatch(onboarding, /agencyName:/);
  assert.match(signup, /E-mail de acesso/);
  assert.match(signup, /readOnly value=\{email\}/);
  assert.match(signup, /!inviteMode \? \(/);
  assert.match(signup, /!inviteMode && confirmationRequired/);
  assert.match(invitedSignup, /email_confirm: true/);
  assert.match(invitedSignup, /full_name: context\.responsibleName/);
  assert.match(continuation, /findAuthUserByEmail/);
  assert.match(continuation, /!identity/);
  assert.match(migration, /VALUES \(btrim\(invitation\.proposed_agency_name\)/);
  assert.match(template, /configurar o acesso da Agência/);
  assert.doesNotMatch(template, /pela Agência \{\{agency_name\}\}/);
});
