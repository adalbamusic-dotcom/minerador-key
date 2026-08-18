import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildIsolatedAuthEntryUrl } from "../lib/auth/isolated-auth-entry.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const originalEnv = { app: process.env.APP_BASE_URL, publicApp: process.env.NEXT_PUBLIC_APP_URL, nextAuth: process.env.NEXTAUTH_URL, nodeEnv: process.env.NODE_ENV };

function restoreEnv() {
  for (const [key, value] of Object.entries({ APP_BASE_URL: originalEnv.app, NEXT_PUBLIC_APP_URL: originalEnv.publicApp, NEXTAUTH_URL: originalEnv.nextAuth, NODE_ENV: originalEnv.nodeEnv })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}

test("isolated auth entry uses the existing new-slot route and preserves continue", () => {
  process.env.APP_BASE_URL = "https://app.example.test";
  try {
    const url = buildIsolatedAuthEntryUrl("/onboarding/agencia?token=token-value");
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://app.example.test");
    assert.equal(parsed.pathname, "/auth/new-slot");
    assert.equal(parsed.searchParams.get("next"), "/onboarding/agencia?token=token-value");
    assert.doesNotMatch(url, /actorUserId|userId|agencyId|brandId/i);
  } finally {
    restoreEnv();
  }
});

test("isolated auth entry validates missing/invalid bases, localhost policy and open redirects", () => {
  try {
    delete process.env.APP_BASE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    assert.throws(() => buildIsolatedAuthEntryUrl("/login"), /APP_BASE_URL_MISSING/);
    process.env.APP_BASE_URL = "not-a-url";
    assert.throws(() => buildIsolatedAuthEntryUrl("/login"), /APP_BASE_URL_INVALID/);
    process.env.APP_BASE_URL = "http://localhost:3000";
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    assert.equal(new URL(buildIsolatedAuthEntryUrl("/login")).origin, "http://localhost:3000");
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    assert.throws(() => buildIsolatedAuthEntryUrl("/login"), /APP_BASE_URL_LOCALHOST_IN_PRODUCTION/);
    process.env.APP_BASE_URL = "https://app.example.test";
    assert.throws(() => buildIsolatedAuthEntryUrl("https://evil.example.test"), /ISOLATED_AUTH_CONTINUE_INVALID/);
  } finally {
    restoreEnv();
  }
});

test("dispatcher wraps the bearer-bearing onboarding path without persisting it", async () => {
  const [dispatcher, messages, route, continuation, signup] = await Promise.all([
    read("lib/server/communication/dispatcher.ts"),
    read("lib/server/communication/messages.ts"),
    read("app/api/onboarding/agency/route.ts"),
    read("app/api/onboarding/agency/continue/route.ts"),
    read("app/cadastro/page.tsx"),
  ]);
  assert.match(dispatcher, /buildIsolatedAuthEntryUrl/);
  assert.match(dispatcher, /buildConfiguredAppUrl/);
  assert.doesNotMatch(dispatcher, /originUrl|baseUrl:\s*origin/);
  assert.match(dispatcher, /createAgencyInvitationTokenGeneration/);
  assert.doesNotMatch(messages, /raw_token|token text|token varchar/i);
  assert.match(route, /inspectAgencyInvitation/);
  assert.match(continuation, /findAuthUserByEmail/);
  assert.match(continuation, /callbackUrl/);
  assert.match(continuation, /inviteToken/);
  assert.match(signup, /auth\.signUp/);
  assert.doesNotMatch(dispatcher, /localStorage|indexedDB|console\.(log|info|error)/);
});
