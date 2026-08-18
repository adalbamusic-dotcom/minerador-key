import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { authFailureMessage, classifyAuthError } from "../lib/auth/classify-auth-error.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("classifica estados Auth sem depender apenas da mensagem", () => {
  assert.equal(classifyAuthError({ code: "email_not_confirmed", status: 400 }), "EMAIL_NOT_CONFIRMED");
  assert.equal(classifyAuthError({ code: "invalid_credentials", status: 400 }), "INVALID_CREDENTIALS");
  assert.equal(classifyAuthError({ code: "user_already_exists" }), "EXISTING_IDENTITY_REUSED");
  assert.equal(classifyAuthError({ status: 429, code: "too_many_requests" }), "RATE_LIMITED");
  assert.equal(classifyAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch" }), "NETWORK");
  assert.equal(classifyAuthError({ code: "invalid_api_key", status: 401 }), "CONFIGURATION");
  assert.equal(classifyAuthError({ status: 400, message: "Unexpected provider response" }), "OUTRO");
  assert.equal(authFailureMessage("INVALID_CREDENTIALS"), "E-mail ou senha incorretos.");
});

test("login não mascara falhas de configuração ou rede como senha inválida", async () => {
  const login = await read("app/login/page.tsx");
  assert.match(login, /authFailureMessage/);
  assert.match(login, /authFailureDiagnostic/);
  assert.doesNotMatch(login, /signIn\("credentials"/);
});

test("recuperação usa Supabase Auth e preserva callback seguro", async () => {
  const [login, recovery, callback] = await Promise.all([read("app/login/page.tsx"), read("app/recuperar-senha/page.tsx"), read("app/auth/callback/route.ts")]);
  assert.match(login, /Esqueci minha senha/);
  assert.match(recovery, /resetPasswordForEmail/);
  assert.match(recovery, /updateUser\(\{ password \}\)/);
  assert.match(callback, /safeAuthRedirect/);
  assert.doesNotMatch(recovery, /SUPABASE_SERVICE_ROLE_KEY|localStorage|indexedDB/);
});

test("cadastro de identidade existente não confirma criação por resposta ofuscada", async () => {
  const signup = await read("app/cadastro/page.tsx");
  assert.match(signup, /Se você já possui uma conta, entre ou redefina sua senha/);
  assert.match(signup, /EMAIL_CONFIRMATION_REQUIRED/);
  assert.doesNotMatch(signup, /Este e-mail já está cadastrado/);
});

test("Admin separa agência ativa de prontidão de acesso", async () => {
  const [panel, admin] = await Promise.all([read("modules/admin/agencies-admin-panel.tsx"), read("lib/server/agency-admin.ts")]);
  assert.match(panel, /Agência: ACTIVE/);
  assert.match(panel, /Acesso: \{agency\.accessStatus/);
  assert.match(admin, /accessStatus/);
  assert.match(admin, /REQUIRES_ATTENTION/);
  assert.doesNotMatch(panel, /Enviar link de acesso|Gerar acesso temporário|Gerar recuperação manual/);
});

test("convite aprovado enfileira mensagem e não chama Resend na rota", async () => {
  const [route, applications, dispatcher, migration] = await Promise.all([
    read("app/api/admin/agency-applications/route.ts"),
    read("lib/server/agency-onboarding.ts"),
    read("lib/server/communication/dispatcher.ts"),
    read("supabase/migrations/0020_communication_transactional_minimum.sql"),
  ]);
  assert.match(route, /dispatchCommunicationMessage/);
  assert.match(applications, /enqueueCommunicationMessage/);
  assert.match(dispatcher, /claimCommunicationMessage/);
  assert.match(dispatcher, /attempt_count/);
  assert.match(migration, /communication_messages/);
  assert.match(migration, /communication_delivery_events/);
});
