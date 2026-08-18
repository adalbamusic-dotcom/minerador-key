import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseInvitedSignupInput } from "../lib/auth/manual-auth.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("cadastro iniciado por convite usa token e identidade persistida", async () => {
  const [page, route, continuation, onboarding] = await Promise.all([
    read("app/cadastro/page.tsx"),
    read("app/api/auth/invited-signup/route.ts"),
    read("app/api/onboarding/agency/continue/route.ts"),
    read("app/api/onboarding/agency/route.ts"),
  ]);

  assert.match(page, /inviteToken/);
  assert.match(page, /Criar sua conta/);
  assert.match(page, /name="email" type="email" required readOnly value=\{email\} autoComplete="username"/);
  assert.match(page, /autoComplete="new-password"/);
  assert.equal((page.match(/autoComplete="new-password"/g) || []).length, 2);
  assert.match(page, /inviteMode \? "Criar conta"/);
  assert.match(page, /responsible_name/);
  assert.doesNotMatch(page, /inviteEmail/);

  assert.match(route, /resolveInvitedAccountCreationContext\(service, token\)/);
  assert.match(route, /auth\.admin\.createUser/);
  assert.match(route, /email_confirm: true/);
  assert.match(route, /user_metadata: \{ full_name: context\.responsibleName \}/);
  assert.match(route, /signInWithPassword/);
  assert.doesNotMatch(route, /auth\.signUp/);
  assert.doesNotMatch(route, /body\?\.email|body\?\.name/);
  assert.doesNotMatch(route, /console\.(log|info|warn|error)/);

  assert.match(continuation, /identity\.identityStatus === "pending_confirmation"/);
  assert.match(continuation, /inviteToken/);
  assert.doesNotMatch(continuation, /inviteEmail/);
  assert.match(onboarding, /completeAgencyOnboarding/);
});

test("senha convidada exige confirmação e não aceita nome/e-mail do cliente", () => {
  const valid = parseInvitedSignupInput({ password: "senha-123", passwordConfirmation: "senha-123" });
  assert.deepEqual(valid, { password: "senha-123", passwordConfirmation: "senha-123" });
  assert.throws(() => parseInvitedSignupInput({ password: "senha-123", passwordConfirmation: "outra" }));
  assert.throws(() => parseInvitedSignupInput({ password: "curta", passwordConfirmation: "curta" }));
});

test("cadastro público mantém a confirmação normal separada", async () => {
  const [page, route] = await Promise.all([read("app/cadastro/page.tsx"), read("app/api/auth/signup/route.ts")]);
  assert.match(page, /auth\.signUp/);
  assert.match(page, /resendSignupConfirmation/);
  assert.match(page, /emailRedirectTo/);
  assert.match(route, /auth\/v1\/signup/);
});
