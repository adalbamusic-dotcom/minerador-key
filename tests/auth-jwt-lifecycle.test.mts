import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertUsableSupabaseJwt,
  getSupabaseSessionErrorMessage,
  readSupabaseJwtMetadata,
  SupabaseTokenValidationError,
  SUPABASE_SESSION_REASONS,
} from "../lib/auth/supabase-token.ts";
import {
  exchangeGoogleIdTokenForSupabaseToken,
  refreshSupabaseAccessToken,
} from "../lib/server/supabase-auth-tokens.ts";

const authRoutePath = new URL("../app/api/auth/[...nextauth]/route.ts", import.meta.url);
const browserClientPath = new URL("../lib/supabase/browser-authenticated-client.ts", import.meta.url);
const providerPath = new URL("../components/providers.tsx", import.meta.url);
const mineRoutePath = new URL("../app/api/mine/route.ts", import.meta.url);
const mineradorPath = new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url);
const arquitetoPath = new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url);

const subject = "d67ebbad-a590-45f8-8bb5-a19c6241ac1b";

function fixtureJwt(overrides: Record<string, unknown> = {}) {
  const payload = {
    iss: "https://example.supabase.co/auth/v1",
    aud: "authenticated",
    sub: subject,
    role: "authenticated",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.fixture-signature`;
}

function mockSupabaseResponse(accessToken = fixtureJwt(), refreshToken = "refresh-next") {
  return new Response(JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("JWT Supabase expõe issuer, audience, subject, role, iat e exp sem registrar o token", () => {
  const token = fixtureJwt();
  const metadata = readSupabaseJwtMetadata(token);
  assert.equal(metadata.issuer, "https://example.supabase.co/auth/v1");
  assert.equal(metadata.audience, "authenticated");
  assert.equal(metadata.subject, subject);
  assert.equal(metadata.role, "authenticated");
  assert.equal(typeof metadata.issuedAt, "number");
  assert.equal(typeof metadata.expiresAt, "number");
  assert.equal(metadata.expired, false);
  assert.equal(assertUsableSupabaseJwt(token).subject, subject);
});

test("JWT dentro da margem ou expirado nunca é aceito para o PostgREST", () => {
  assert.throws(
    () => assertUsableSupabaseJwt(fixtureJwt({ exp: Math.floor(Date.now() / 1000) + 30 })),
    error => error instanceof SupabaseTokenValidationError && error.code === "SUPABASE_TOKEN_EXPIRED",
  );
  assert.throws(
    () => assertUsableSupabaseJwt(fixtureJwt({ exp: Math.floor(Date.now() / 1000) - 1 })),
    error => error instanceof SupabaseTokenValidationError && error.code === "SUPABASE_TOKEN_EXPIRED",
  );
});

test("JWT sem claims de tenant/authenticated recebe código de claims inválidos", () => {
  assert.throws(
    () => assertUsableSupabaseJwt(fixtureJwt({ sub: undefined, role: undefined })),
    error => error instanceof SupabaseTokenValidationError && error.code === "SUPABASE_TOKEN_INVALID_CLAIMS",
  );
});

test("refresh Supabase substitui o JWT antigo e preserva a identidade", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture";
  globalThis.fetch = async () => mockSupabaseResponse(fixtureJwt({ iat: Math.floor(Date.now() / 1000) }));
  try {
    const result = await refreshSupabaseAccessToken("refresh-fixture-1");
    assert.notEqual(result.accessToken, "refresh-fixture-1");
    assert.equal(result.metadata.subject, subject);
    assert.equal(result.metadata.role, "authenticated");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }
});

test("duas renovações simultâneas compartilham uma única chamada", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let calls = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture";
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    return mockSupabaseResponse();
  };
  try {
    const results = await Promise.all([
      refreshSupabaseAccessToken("refresh-concurrent"),
      refreshSupabaseAccessToken("refresh-concurrent"),
    ]);
    assert.equal(calls, 1);
    assert.equal(results[0].accessToken, results[1].accessToken);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }
});

test("Google usa troca server-side e nunca vira session.accessToken Supabase", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture";
  let requestBody = "";
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body || "");
    return mockSupabaseResponse();
  };
  try {
    const result = await exchangeGoogleIdTokenForSupabaseToken("google-id-token", "google-access-token");
    assert.equal(result.metadata.subject, subject);
    assert.match(requestBody, /"provider":"google"/);
    assert.match(requestBody, /"id_token":"google-id-token"/);
    assert.match(requestBody, /"access_token":"google-access-token"/);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }
});

test("troca Google sem access token ou refresh token produz diagnóstico específico", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture";
  try {
    globalThis.fetch = async () => mockSupabaseResponse("", "refresh-next");
    await assert.rejects(
      () => exchangeGoogleIdTokenForSupabaseToken("google-id-token"),
      error => error instanceof Error && "code" in error && error.code === "SUPABASE_ACCESS_TOKEN_MISSING",
    );
    globalThis.fetch = async () => mockSupabaseResponse(fixtureJwt(), "");
    await assert.rejects(
      () => exchangeGoogleIdTokenForSupabaseToken("google-id-token"),
      error => error instanceof Error && "code" in error && error.code === "SUPABASE_REFRESH_TOKEN_MISSING",
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }
});

test("refresh inválido não possui fallback anon e não reutiliza token vencido", async () => {
  const [server, browser, authRoute] = await Promise.all([
    readFile(new URL("../lib/server/supabase-auth-tokens.ts", import.meta.url), "utf8"),
    readFile(browserClientPath, "utf8"),
    readFile(authRoutePath, "utf8"),
  ]);
  assert.doesNotMatch(server, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(browser, /return\s+supabaseAnonKey/);
  assert.match(browser, /assertUsableSupabaseJwt/);
  assert.match(authRoute, /clearSupabaseToken\(token\)/);
  assert.match(authRoute, /SUPABASE_TOKEN_REFRESH_FAILED/);
  assert.doesNotMatch(browser, /console\.(log|error).*accessToken/);
});

test("cliente browser usa callback accessToken dinâmico e sessão revalidada no foco", async () => {
  const [browser, provider] = await Promise.all([
    readFile(browserClientPath, "utf8"),
    readFile(providerPath, "utf8"),
  ]);
  assert.match(browser, /accessToken: getCurrentSupabaseToken/);
  assert.match(browser, /getSession\(\)/);
  assert.doesNotMatch(browser, /global:\s*\{[\s\S]*Authorization/);
  assert.doesNotMatch(browser, /Authorization: `Bearer/);
  assert.match(provider, /refetchOnWindowFocus/);
});

test("Minerador e Arquiteto usam retry somente em SELECT e preservam filtros tenantizados", async () => {
  const [minerador, arquiteto] = await Promise.all([
    readFile(mineradorPath, "utf8"),
    readFile(arquitetoPath, "utf8"),
  ]);
  for (const source of [minerador, arquiteto]) {
    assert.match(source, /createAuthenticatedBrowserClient\(\)/);
    assert.match(source, /await getCurrentSupabaseToken\(\)/);
    assert.match(source, /withSupabaseSelectRetry/);
    assert.doesNotMatch(source, /supabase\.auth\.setSession/);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
  }
  assert.match(minerador, /eq\("marca_id", selectedBrandId\)/);
  assert.match(minerador, /eq\("brand_id", selectedBrandId\)/);
  assert.match(arquiteto, /eq\("marca_id", selectedBrandId\)/);
  assert.match(arquiteto, /eq\("brand_id", selectedBrandId\)/);
});

test("Google Sheets lê somente o token Google no servidor", async () => {
  const source = await readFile(mineRoutePath, "utf8");
  assert.match(source, /getToken\(/);
  assert.match(source, /googleAccessToken/);
  assert.match(source, /auth\.setCredentials\(\{ access_token: googleAccessToken \}\)/);
  assert.doesNotMatch(source, /session\.accessToken/);
});

test("NextAuth guarda refresh Supabase, renova no callback e não atribui access_token Google ao Supabase", async () => {
  const source = await readFile(authRoutePath, "utf8");
  assert.match(source, /refreshToken: data\.refresh_token/);
  assert.match(source, /refreshSupabaseAccessToken/);
  assert.match(source, /exchangeGoogleIdTokenForSupabaseToken/);
  assert.match(source, /token\.googleAccessToken = account\.access_token/);
  assert.doesNotMatch(source, /token\.accessToken = account\.access_token/);
  assert.match(source, /token\.accessTokenKind = "supabase"/);
  assert.match(source, /token\.error = "SUPABASE_REFRESH_TOKEN_MISSING"/);
  assert.match(source, /GOOGLE_ID_TOKEN_MISSING/);
  assert.match(source, /SUPABASE_GOOGLE_EXCHANGE_FAILED/);
  assert.match(source, /SUPABASE_SESSION_READY/);
});

test("mensagem de expiração não mascara ausência, troca Google ou claims inválidos", () => {
  assert.equal(getSupabaseSessionErrorMessage("SUPABASE_GOOGLE_EXCHANGE_FAILED"), "Não foi possível criar sua sessão de dados. Verifique o login Google e tente novamente.");
  assert.equal(getSupabaseSessionErrorMessage("GOOGLE_ID_TOKEN_MISSING"), "O login Google não forneceu os dados necessários. Entre novamente.");
  assert.equal(getSupabaseSessionErrorMessage("SUPABASE_TOKEN_INVALID_CLAIMS"), "A sessão de dados recebida é inválida. Entre novamente.");
  assert.equal(getSupabaseSessionErrorMessage("SUPABASE_TOKEN_EXPIRED", Math.floor(Date.now() / 1000) - 1), "Sua sessão expirou. Entre novamente.");
  assert.equal(getSupabaseSessionErrorMessage("SUPABASE_TOKEN_REFRESH_FAILED"), "Não foi possível renovar sua sessão. Entre novamente.");
  assert.doesNotMatch(getSupabaseSessionErrorMessage("SUPABASE_ACCESS_TOKEN_MISSING"), /expirou/);
});

test("catálogo de razões cobre o ciclo completo sem códigos genéricos", () => {
  assert.deepEqual([...SUPABASE_SESSION_REASONS], [
    "SESSION_LOADING",
    "NEXTAUTH_SESSION_MISSING",
    "GOOGLE_ID_TOKEN_MISSING",
    "SUPABASE_GOOGLE_EXCHANGE_FAILED",
    "SUPABASE_ACCESS_TOKEN_MISSING",
    "SUPABASE_REFRESH_TOKEN_MISSING",
    "SUPABASE_TOKEN_INVALID_CLAIMS",
    "SUPABASE_TOKEN_EXPIRED",
    "SUPABASE_TOKEN_REFRESH_FAILED",
    "SUPABASE_SESSION_READY",
  ]);
});

test("falha de rede da troca Google recebe código de troca, não de expiração", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture";
  globalThis.fetch = async () => { throw new Error("network-fixture"); };
  try {
    await assert.rejects(
      () => exchangeGoogleIdTokenForSupabaseToken("google-id-token"),
      error => error instanceof Error && "code" in error && error.code === "SUPABASE_GOOGLE_EXCHANGE_FAILED",
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }
});

test("recusa do Supabase no refresh recebe código de refresh", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture";
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "invalid_refresh_token" }), { status: 401 });
  try {
    await assert.rejects(
      () => refreshSupabaseAccessToken("refresh-rejected"),
      error => error instanceof Error && "code" in error && error.code === "SUPABASE_TOKEN_REFRESH_FAILED",
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }
});

test("resultado estruturado e diagnóstico seguro não expõem token ou refresh token", async () => {
  const browser = await readFile(browserClientPath, "utf8");
  assert.match(browser, /getCurrentSupabaseTokenResult/);
  assert.match(browser, /ok: true/);
  assert.match(browser, /reason: "SUPABASE_SESSION_READY"/);
  assert.match(browser, /expiresAt/);
  assert.match(browser, /accessTokenPresent/);
  assert.match(browser, /refreshTokenPresent: false/);
  assert.doesNotMatch(browser, /console\.(log|error).*session\.accessToken/);
  assert.doesNotMatch(browser, /console\.(log|error).*refreshToken/);
});

test("NextAuth separa provider Google, razão da sessão e access token Supabase", async () => {
  const source = await readFile(authRoutePath, "utf8");
  assert.match(source, /token\.supabaseProvider = "google"/);
  assert.match(source, /session\.supabaseSessionReason = token\.supabaseSessionReason/);
  assert.match(source, /applySupabaseToken\(token, supabaseToken, undefined, "google"\)/);
  assert.doesNotMatch(source, /session\.refreshToken/);
});

test("Minerador e Arquiteto registram diagnóstico seguro e classificam expiração", async () => {
  const [minerador, arquiteto] = await Promise.all([
    readFile(mineradorPath, "utf8"),
    readFile(arquitetoPath, "utf8"),
  ]);
  for (const source of [minerador, arquiteto]) {
    assert.match(source, /getSupabaseSessionErrorMessage/);
    assert.match(source, /isSupabaseTokenExpirationError/);
    assert.match(source, /\.diagnostic/);
    assert.doesNotMatch(source, /authError \? "Sua sessão expirou/);
  }
});

test("Google sem id_token interrompe o callback e não cria sessão utilizável", async () => {
  const source = await readFile(authRoutePath, "utf8");
  assert.match(source, /if \(!account\.id_token\)/);
  assert.match(source, /throw new Error\("GOOGLE_ID_TOKEN_MISSING"\)/);
  assert.match(source, /pages:[\s\S]*error: "\/login"/);
});

test("falha da troca Google interrompe o callback com reason específico", async () => {
  const source = await readFile(authRoutePath, "utf8");
  assert.match(source, /token\.error = safeTokenError\(error, "SUPABASE_GOOGLE_EXCHANGE_FAILED"\)/);
  assert.match(source, /throw new Error\(token\.error\)/);
  assert.doesNotMatch(source, /token\.error = "SupabaseTokenExchangeError"/);
});

test("session expõe somente supabaseAuth seguro e access token quando ready", async () => {
  const [authRoute, types] = await Promise.all([
    readFile(authRoutePath, "utf8"),
    readFile(new URL("../types/next-auth.d.ts", import.meta.url), "utf8"),
  ]);
  assert.match(authRoute, /session\.supabaseAuth = \{/);
  assert.match(authRoute, /status: isSupabaseReady \? "ready" : "error"/);
  assert.match(authRoute, /reason:/);
  assert.match(authRoute, /expiresAt:/);
  assert.match(authRoute, /session\.accessToken = isSupabaseReady \? token\.accessToken : undefined/);
  assert.doesNotMatch(authRoute, /session\.refreshToken/);
  assert.match(types, /supabaseAuth\?:/);
});

test("diagnóstico server-side é limitado a desenvolvimento e não contém valores de token", async () => {
  const source = await readFile(authRoutePath, "utf8");
  for (const field of ["provider", "step", "reason", "status", "code", "accessTokenPresent", "refreshTokenPresent", "expiresAtPresent", "subjectPresent", "role", "audience", "sessionError"]) {
    assert.match(source, new RegExp(field));
  }
  assert.match(source, /process\.env\.NODE_ENV === "production"/);
  assert.doesNotMatch(source, /console\.error\([^\n]*(id_token|access_token|refresh_token|Authorization|cookie)/i);
});

test("o fluxo Credentials preserva access/refresh e também aborta sessão incompleta", async () => {
  const source = await readFile(authRoutePath, "utf8");
  assert.match(source, /refreshToken: data\.refresh_token/);
  assert.match(source, /accessToken: data\.access_token/);
  assert.match(source, /throw new Error\("SUPABASE_REFRESH_TOKEN_MISSING"\)/);
  assert.match(source, /applySupabaseToken\(token, supabaseToken, credentialsUser\.id, "credentials"\)/);
});

test("o login bloqueia o workspace quando supabaseAuth não está pronto", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /sessionStatus === "authenticated" && session\?\.supabaseAuth\?\.status !== "ready"/);
  assert.match(source, /Sair e entrar novamente/);
});

test("a dependência manual do provider Google permanece documentada sem alteração remota", async () => {
  const docs = await readFile(new URL("../docs/compartilhado/supabase.md", import.meta.url), "utf8");
  assert.match(docs, /provider Google no Supabase/);
  assert.match(docs, /Nenhuma configuração remota foi alterada/);
  assert.match(docs, /SUPABASE_GOOGLE_EXCHANGE_FAILED/);
});
