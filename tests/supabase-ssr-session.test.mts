import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("infraestrutura SSR e login manual nativo não expõem service role no browser", async () => {
  const [browser, server, proxy, signup, signupPage] = await Promise.all([
    read("lib/supabase/browser-client.ts"), read("lib/supabase/server-client.ts"), read("lib/supabase/session-proxy.ts"), read("app/api/auth/signup/route.ts"), read("app/cadastro/page.tsx"),
  ]);
  assert.match(browser, /createBrowserClient/);
  assert.match(server, /await cookies\(\)/);
  assert.match(proxy, /supabase\.auth\.getUser\(\)/);
  assert.match(signup, /auth\/v1\/signup/);
  assert.match(signupPage, /auth\.signUp/);
  assert.match(signupPage, /emailRedirectTo/);
  for (const source of [browser, server, proxy, signup, signupPage]) assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("Google continua oculto e suspenso nesta fase", async () => {
  const [button, login, signup] = await Promise.all([read("components/auth/google-oauth-button.tsx"), read("app/page.tsx"), read("app/cadastro/page.tsx")]);
  assert.match(button, /enabled = false/);
  assert.doesNotMatch(login, /GoogleOAuthButton/);
  assert.doesNotMatch(signup, /GoogleOAuthButton/);
});
