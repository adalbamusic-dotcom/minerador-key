import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildIsolatedAuthEntryUrl } from "../lib/auth/isolated-auth-entry.ts";
import { buildSessionSlotOrigin } from "../lib/auth/session-slot.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const originalAppBaseUrl = process.env.APP_BASE_URL;
const originalNodeEnv = process.env.NODE_ENV;

function restoreEnvironment() {
  const env = process.env as Record<string, string | undefined>;
  if (originalAppBaseUrl === undefined) delete env.APP_BASE_URL;
  else env.APP_BASE_URL = originalAppBaseUrl;
  if (originalNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = originalNodeEnv;
}

test("convite AdaSEO gera entrada isolada e preserva o mesmo onboarding", () => {
  const env = process.env as Record<string, string | undefined>;
  env.APP_BASE_URL = "http://localhost:3000";
  env.NODE_ENV = "development";
  try {
    const link = buildIsolatedAuthEntryUrl("/onboarding/agencia?token=redacted-token");
    const parsed = new URL(link);
    assert.equal(parsed.origin, "http://localhost:3000");
    assert.equal(parsed.pathname, "/auth/new-slot");
    assert.equal(parsed.searchParams.get("next"), "/onboarding/agencia?token=redacted-token");
    assert.match(link, /\/auth\/new-slot\?next=/);
    assert.doesNotMatch(link, /first|default|owner|agencyName/i);
  } finally {
    restoreEnvironment();
  }
});

test("new-slot deriva host novo sem transportar identidade e mantém a continuação", async () => {
  const [route, callback, login, signup, onboarding] = await Promise.all([
    read("app/auth/new-slot/route.ts"),
    read("app/auth/callback/route.ts"),
    read("app/login/page.tsx"),
    read("app/cadastro/page.tsx"),
    read("app/onboarding/agencia/page.tsx"),
  ]);
  const slotOrigin = buildSessionSlotOrigin("http://localhost:3000/auth/new-slot?next=%2Fonboarding%2Fagencia", "smoke-slot");
  assert.equal(slotOrigin, "http://s-smoke-slot.localhost:3000");
  assert.match(route, /buildSessionSlotOrigin\(request\.url, createSessionSlotId\(\)\)/);
  assert.match(route, /safeAuthRedirect\(request\.nextUrl\.searchParams\.get\("next"\), "\/login"\)/);
  assert.doesNotMatch(route, /getSession|getUser|cookie|token|userId|localStorage|indexedDB/i);
  assert.match(callback, /safeAuthRedirect\(request\.nextUrl\.searchParams\.get\("next"\)\)/);
  assert.match(login, /safeAuthRedirect\(searchParams\.get\("callbackUrl"\)\)/);
  assert.match(signup, /emailRedirectTo:.*\/auth\/callback\?next=/);
  assert.match(onboarding, /\/onboarding\/agencia/);
});

test("sessão pré-existente no host base não desvia a criação do slot", async () => {
  const route = await read("app/auth/new-slot/route.ts");
  assert.doesNotMatch(route, /status.*authenticated|supabase\.auth|getUser|getSession|admin/);
  assert.match(route, /NextResponse\.redirect\(destination\)/);
});
