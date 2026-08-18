import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("preflight do Vault é read-only e sanitizado", async () => {
  const source = await read("supabase/scripts/fase-comunicacao-vault-preflight-read-only.sql");
  assert.doesNotMatch(source, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE)\b/i);
  assert.match(source, /vault_extension_available/);
  assert.match(source, /preflight_status/);
  assert.match(source, /p\.prokind = 'f'/);
  assert.doesNotMatch(source, /SELECT[\s\S]{0,120}decrypted_secret(?!s)/i);
});

test("0019 usa metadata e Vault, nunca API key em tabela pública", async () => {
  const migration = await read("supabase/migrations/0019_platform_communication.sql");
  assert.match(migration, /platform_communication_config/);
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /vault\.update_secret/);
  assert.match(migration, /secret_ref uuid/);
  assert.doesNotMatch(migration, /api_key|plaintext_secret/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.platform_communication_secret/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.platform_communication_secret\(\) TO service_role/);
  assert.match(migration, /COMMUNICATION_0019_FUNCTIONS_NOT_CREATED/);
});

test("serviço de comunicação é server-only e o Resend não é chamado pelos módulos", async () => {
  const [service, provider, dispatcher, invitationRoute, accessRoute, communicationRoute] = await Promise.all([
    read("lib/server/communication/service.ts"),
    read("lib/server/communication/resend-provider.ts"),
    read("lib/server/communication/dispatcher.ts"),
    read("app/api/admin/agency-applications/route.ts"),
    read("app/api/admin/agencies/route.ts"),
    read("app/api/admin/communication/route.ts"),
  ]);
  assert.match(service, /import "server-only"/);
  assert.match(provider, /import "server-only"/);
  assert.doesNotMatch(dispatcher, /api\.resend\.com/);
  assert.doesNotMatch(invitationRoute, /api\.resend\.com/);
  assert.doesNotMatch(accessRoute, /api\.resend\.com/);
  assert.match(dispatcher, /sendRenderedCommunicationMessage/);
  assert.match(communicationRoute, /dispatch_once/);
  assert.match(communicationRoute, /dispatchCommunicationMessage/);
  assert.match(communicationRoute, /requireCanonicalPlatformAdmin/);
});

test("rota e interface Admin não retornam nem preenchem o segredo salvo", async () => {
  const [route, panel] = await Promise.all([read("app/api/admin/communication/route.ts"), read("modules/admin/communication-admin-panel.tsx")]);
  assert.match(route, /requireCanonicalPlatformAdmin/);
  assert.match(route, /credentialConfigured/);
  assert.doesNotMatch(route, /decrypted_secret|secret_ref.*NextResponse|apiKey.*NextResponse/);
  assert.match(panel, /type="password"/);
  assert.match(panel, /setForm\(\(current\) => \(\{ \.\.\.current, apiKey: "" \}\)\)/);
  assert.doesNotMatch(panel, /secret_ref|decrypted_secret/);
});

test("pós-validação exige Vault, acesso server-side e zero exposição", async () => {
  const validation = await read("supabase/scripts/fase-comunicacao-0019-post-validation-read-only.sql");
  assert.match(validation, /anon_secret_access/);
  assert.match(validation, /authenticated_secret_access/);
  assert.match(validation, /provider_config_secret_exposure/);
  assert.match(validation, /post_migration_status/);
  assert.doesNotMatch(validation, /SELECT\s+.*decrypted_secret/i);
});
test("0022 prepara hardening ACL exato sem alterar defaults globais", async () => {
  const [migration, preflight, rollback, addendum] = await Promise.all([
    read("supabase/migrations/0022_communication_service_role_acl_hardening.sql"),
    read("supabase/scripts/fase-comunicacao-0022-preflight-read-only.sql"),
    read("supabase/scripts/fase-comunicacao-0022-rollback.sql"),
    read("docs/compartilhado/adendo-0022-communication-service-role-acl-hardening.md"),
  ]);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE/);
  assert.match(migration, /GRANT SELECT, INSERT\s+ON TABLE public\.communication_delivery_events/);
  assert.match(migration, /GRANT SELECT\s+ON TABLE public\.agency_invitation_token_generations/);
  assert.doesNotMatch(migration.replace(/--[^\n]*/g, ""), /ALTER DEFAULT PRIVILEGES/i);
  assert.match(preflight, /MAINTAIN/);
  assert.match(preflight, /summary:acl_contract/);
  assert.match(rollback, /GRANT ALL PRIVILEGES/);
  assert.match(addendum, /Status: Proposto/);
  const executable = preflight.replace(/--[^\n]*/g, "").replace(/'(?:''|[^'])*'/g, "");
  for (const keyword of ["INSERT", "UPDATE", "DELETE", "MERGE", "CREATE", "ALTER", "DROP", "GRANT", "REVOKE", "TRUNCATE", "CALL"]) {
    assert.doesNotMatch(executable, new RegExp(`\\b${keyword}\\b`, "i"));
  }
});
test("test_connection usa a transição canônica sem relaxar o dispatcher", async () => {
  const [service, route, dispatcher, panel] = await Promise.all([
    read("lib/server/communication/service.ts"),
    read("app/api/admin/communication/route.ts"),
    read("lib/server/communication/dispatcher.ts"),
    read("modules/admin/communication-admin-panel.tsx"),
  ]);
  const testFunction = service.slice(service.indexOf("export async function sendCommunicationTest"));
  assert.match(service, /COMMUNICATION_CONFIG_NOT_VALIDATING/);
  assert.match(service, /COMMUNICATION_SENDER_DOMAIN_MISMATCH/);
  assert.match(testFunction, /getCommunicationConfig\(client\)/);
  assert.doesNotMatch(testFunction, /getCommunicationHealth\(client\)/);
  assert.match(testFunction, /resolveSecret\(client\)/);
  assert.match(testFunction, /sendWithResend/);
  assert.match(testFunction, /if \(result\.status === "FAILED"\) await markValidation\(client, "ERROR", result\.errorCode\)/);
  assert.match(route, /if \(result\.status === "SENT"\) await markCommunicationReady\(client\)/);
  assert.match(route, /providerErrorType: result\.providerErrorType/);
  assert.match(route, /providerErrorMessage: result\.providerErrorMessage/);
  assert.match(route, /providerHttpStatus: result\.providerHttpStatus/);
  assert.match(dispatcher, /if \(health\.health !== "READY"\)/);
  assert.match(panel, /Testar conexão envia um e-mail real/);
  assert.match(panel, /config\.status === "NOT_CONFIGURED"/);
});
