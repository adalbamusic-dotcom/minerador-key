import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { agencyInviteFallbackPath, agencyInviteTokenFromPath } from "../lib/auth/agency-invite-fallback.ts";

test("fallback do convite preserva apenas onboarding tokenizado no mesmo host", () => {
  assert.equal(agencyInviteFallbackPath("/onboarding/agencia?token=abc123"), "/onboarding/agencia?token=abc123");
  assert.equal(agencyInviteFallbackPath("/onboarding/agencia?operation=op-1&token=abc123"), "/onboarding/agencia?operation=op-1&token=abc123");
});

test("token do convite é recuperado quando o login encaminha para o cadastro", () => {
  assert.equal(agencyInviteTokenFromPath("/onboarding/agencia?operation=op-1&token=abc123"), "abc123");
  assert.equal(agencyInviteTokenFromPath("/login?callbackUrl=%2Fonboarding%2Fagencia%3Ftoken%3Dabc123"), null);
});

test("outras entradas new-slot nunca usam o fallback do convite", () => {
  for (const next of [
    "/login",
    "/onboarding/agencia",
    "/onboarding/agencia?token=",
    "/onboarding/agencia?token=%20",
    "/onboarding/agencia?token=a&token=b",
    "/onboarding/agencia?token=a#fragmento",
    "/onboarding/agencia/outra?token=a",
    "/cadastro?inviteToken=a",
    "https://evil.example/onboarding/agencia?token=a",
    "//evil.example/onboarding/agencia?token=a",
    "/\\evil.example/onboarding/agencia?token=a",
  ]) {
    assert.equal(agencyInviteFallbackPath(next), null, next);
  }
});

test("rota preserva host isolado quando disponível e usa fallback restrito sem transportar sessão", async () => {
  const route = await readFile(new URL("../app/auth/new-slot/route.ts", import.meta.url), "utf8");
  const onboarding = await readFile(new URL("../app/onboarding/agencia/page.tsx", import.meta.url), "utf8");
  assert.match(route, /buildSessionSlotOrigin\(request\.url, createSessionSlotId\(\)\)/);
  assert.match(route, /agencyInviteFallbackPath\(next\)/);
  assert.match(route, /new URL\(invitePath, request\.url\)/);
  assert.match(route, /Referrer-Policy", "no-referrer"/);
  assert.match(route, /private, no-store/);
  assert.doesNotMatch(route, /getUser|getSession|signOut|localStorage|indexedDB/);
  assert.match(onboarding, /somente uma conta pode ficar conectada por vez/);
  assert.match(onboarding, /session!\.user\.email!\.trim\(\)\.toLowerCase\(\) === invitation\?\.destination_email/);
  assert.match(onboarding, /signOut\(currentPath\)/);
});
