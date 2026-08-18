import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("retomada autenticada expõe somente o convite pendente do próprio ator", async () => {
  const [authorization, contextsRoute, onboardingRoute, selector, onboardingPage] = await Promise.all([
    read("lib/server/canonical-authorization.ts"),
    read("app/api/contexts/route.ts"),
    read("app/api/onboarding/agency/route.ts"),
    read("app/selecionar-marca/select-brand-client.tsx"),
    read("app/onboarding/agencia/page.tsx"),
  ]);

  assert.match(authorization, /findPendingAgencyInvitationForActor/);
  assert.match(authorization, /requireCanonicalActorUserId/);
  assert.match(authorization, /auth\.admin\.getUserById\(actorUserId\)/);
  assert.match(authorization, /destination_email/);
  assert.match(authorization, /\.eq\("status", "APPROVED"\)/);
  assert.match(authorization, /\.eq\("status", "PENDING"\)/);
  assert.match(authorization, /\.gt\("expires_at"/);
  assert.match(authorization, /agency_onboardings/);
  assert.match(contextsRoute, /pendingOnboarding/);
  assert.match(onboardingRoute, /findPendingAgencyInvitationForActor/);
  assert.match(onboardingRoute, /completeAgencyOnboardingForAuthenticatedActor/);
  assert.match(selector, /Acesso aprovado/);
  assert.match(selector, /Finalizar acesso à agência/);
  assert.match(selector, /href="\/onboarding\/agencia"/);
  assert.match(onboardingPage, /fetch\(`\/api\/onboarding\/agency\$\{query\}`/);
  assert.match(onboardingPage, /\.\.\.\(token \? \{ token \} : \{\}\)/);
  assert.doesNotMatch(contextsRoute, /destination_email|email/i);
  assert.doesNotMatch(selector, /localStorage|indexedDB|INSERT|complete_agency_onboarding/i);
  assert.doesNotMatch(onboardingPage, /token_hash|inviteLink|temporaryAccessLink/);
});

test("atores sem convite próprio, convites expirados/revogados ou já aceitos não recebem CTA", async () => {
  const authorization = await read("lib/server/canonical-authorization.ts");
  const selector = await read("app/selecionar-marca/select-brand-client.tsx");
  assert.match(authorization, /status.*PENDING/);
  assert.match(authorization, /agency_onboardings/);
  assert.match(authorization, /if \(onboarding\.data\) return null/);
  assert.doesNotMatch(selector, /first agency|first invitation|fallback/i);
});

test("o CTA apenas abre onboarding; a criação acontece somente na confirmação", async () => {
  const [selector, page, route, onboarding] = await Promise.all([
    read("app/selecionar-marca/select-brand-client.tsx"),
    read("app/onboarding/agencia/page.tsx"),
    read("app/api/onboarding/agency/route.ts"),
    read("lib/server/agency-onboarding.ts"),
  ]);
  assert.match(selector, /<Link href="\/onboarding\/agencia"/);
  assert.doesNotMatch(selector, /onClick=\{\(\) => void complete\(\)\}|fetch\("\/api\/onboarding\/agency"/);
  assert.match(page, /onClick=\{\(\) => void complete\(\)\}/);
  assert.match(route, /completeAgencyOnboardingForAuthenticatedActor/);
  assert.match(onboarding, /rpc\("complete_agency_onboarding_authenticated_with_access"/);
  assert.doesNotMatch(route, /INSERT INTO public\.agencies|createAgency/);
});

test("script pós-0020 v4 é um único result set e somente leitura", async () => {
  const script = await read("supabase/scripts/fase-comunicacao-0020-post-verification-read-only.sql");
  assert.match(script, /2026-08-10-v4/);
  assert.match(script, /Esperado: 249 linhas, sendo 244 PASS\/FAIL e 5 INFO/);
  for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]) {
    assert.match(script, new RegExp(`\\('${privilege}'\\)`));
  }
  assert.match(script, /SELECT check_name, expected, observed, verdict/);
  assert.match(script, /UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM count_rows/);
  assert.equal(
    script
      .replace(/--[^\n]*/g, "")
      .replace(/'(?:''|[^'])*'/g, "")
      .match(/;/g)?.length ?? 0,
    1,
  );
  assert.doesNotMatch(script, /query_to_xml/i);
  assert.doesNotMatch(script, /\bremote\b/i);
  for (const relation of [
    "communication_templates",
    "communication_messages",
    "communication_delivery_events",
    "agency_invitation_token_generations",
  ]) {
    assert.match(script, new RegExp(relation));
  }
  for (const functionName of [
    "communication_dispatch_lease_seconds",
    "create_agency_invitation_token_generation",
    "revoke_agency_invitation_token_generations",
    "enqueue_communication_message",
    "claim_communication_message",
    "complete_communication_message",
    "complete_agency_onboarding_with_token",
    "record_communication_delivery_event",
  ]) {
    assert.match(script, new RegExp(functionName));
  }

  const executable = script
    .replace(/--[^\n]*/g, "")
    .replace(/'(?:''|[^'])*'/g, "''");
  assert.doesNotMatch(executable, /\bpass\b/i);
  for (const keyword of [
    "INSERT", "UPDATE", "DELETE", "MERGE", "CREATE", "ALTER", "DROP",
    "GRANT", "REVOKE", "TRUNCATE", "CALL",
  ]) {
    assert.doesNotMatch(executable, new RegExp(`\\b${keyword}\\b`, "i"));
  }
});

test("preflight de hardening 0020 é sanitizado e somente leitura", async () => {
  const script = await read("supabase/scripts/fase-comunicacao-0020-hardening-preflight-read-only.sql");
  assert.match(script, /token_generations_with_used_and_revoked/);
  assert.match(script, /token_check_used_revoked_in_catalog/);
  assert.match(script, /SELECT check_name, expected, observed, verdict/);
  assert.equal(
    script
      .replace(/--[^\n]*/g, "")
      .replace(/'(?:''|[^'])*'/g, "")
      .match(/;/g)?.length ?? 0,
    1,
  );
  const executable = script
    .replace(/--[^\n]*/g, "")
    .replace(/'(?:''|[^'])*'/g, "");
  for (const keyword of [
    "INSERT", "UPDATE", "DELETE", "MERGE", "CREATE", "ALTER", "DROP",
    "GRANT", "REVOKE", "TRUNCATE", "CALL",
  ]) {
    assert.doesNotMatch(executable, new RegExp(`\\b${keyword}\\b`, "i"));
  }
});

test("logout permanece compartilhado nos shells Admin, Agência e Conta", async () => {
  const [button, productShell, workspaceFrame, sessionContext] = await Promise.all([
    read("components/auth/session-logout-button.tsx"),
    read("components/product-shell.tsx"),
    read("components/workspace-frame.tsx"),
    read("components/auth/supabase-session-context.tsx"),
  ]);

  assert.match(button, /signOut\(callbackUrl\)/);
  assert.match(button, /aria-label=\{compact \? label : undefined\}/);
  assert.match(productShell, /SessionLogoutButton/);
  assert.match(workspaceFrame, /ProductShell/);
  assert.match(sessionContext, /auth\.signOut\(\)/);
  assert.doesNotMatch(workspaceFrame, /localStorage|indexedDB/i);
});
