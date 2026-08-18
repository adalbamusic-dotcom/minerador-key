import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("Fase 2C usa somente a sessão Supabase nativa em login, browser e shells", async () => {
  const [login, provider, browserAuth, sessionContext, authz] = await Promise.all([
    read("app/login/page.tsx"), read("components/providers.tsx"), read("lib/supabase/browser-authenticated-client.ts"), read("components/auth/supabase-session-context.tsx"), read("lib/server/authz.ts"),
  ]);
  assert.match(login, /signInWithPassword/);
  assert.match(login, /safeAuthRedirect/);
  assert.match(provider, /SupabaseSessionProvider/);
  assert.match(sessionContext, /onAuthStateChange/);
  assert.match(browserAuth, /getBrowserSupabaseClient/);
  assert.match(authz, /requireSupabaseUser/);
  for (const source of [login, provider, browserAuth, sessionContext, authz]) assert.doesNotMatch(source, /next-auth|getServerSession|\bSessionProvider\b|safeAuthNext/i);
});

test("rota legada mine permanece explicitamente desativada e sem JWT", async () => {
  const source = await read("app/api/mine/route.ts");
  assert.match(source, /code: "DISABLED"/);
  assert.match(source, /status: 410/);
  assert.doesNotMatch(source, /next-auth|googleapis|access_token|refresh_token/i);
});

test("callback informa falha sanitizada e não aceita redirecionamento externo", async () => {
  const [callback, login] = await Promise.all([read("app/auth/callback/route.ts"), read("app/login/page.tsx")]);
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /oauth_code_missing/);
  assert.match(login, /oauth_code_missing/);
  assert.match(login, /oauth_callback_failed/);
  assert.doesNotMatch(callback, /console\.(?:log|error)/);
});
