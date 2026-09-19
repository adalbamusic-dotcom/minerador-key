import assert from "node:assert/strict";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { verifyMcpOAuthToken } from "../lib/server/mcp-oauth.ts";
import { WriterMcpAuthError } from "../lib/server/writer-mcp-delegation.ts";

/*
 * O par de chaves nasce no teste; o JWKS é injetado. Nenhuma requisição sai:
 * o cliente Supabase verifica ES256 localmente com WebCrypto quando o `kid`
 * está no JWKS fornecido.
 */
const issuer = "https://project.supabase.test/auth/v1";
const kid = "test-signing-key";
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const other = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwks = { keys: [{ ...(publicKey.export({ format: "jwk" }) as Record<string, unknown>), kid, alg: "ES256", use: "sig" }] } as { keys: never[] };
const client = createClient("https://project.supabase.test", "public-anon-key", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async () => { throw new Error("token verification must not reach the network"); } },
});

const actorId = "0d7c7e0e-6a1b-4b1c-9e7d-2f4a6b8c0d1e";
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

function mint(payload: Record<string, unknown>, key: KeyObject = privateKey, header: Record<string, unknown> = { alg: "ES256", typ: "JWT", kid }) {
  const input = `${b64(header)}.${b64(payload)}`;
  const signature = sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${input}.${signature}`;
}

const now = Math.floor(Date.now() / 1000);
const claims = { iss: issuer, sub: actorId, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600, client_id: "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d" };
const deps = { issuer, jwks, client };

async function rejects(token: string, code: string) {
  await assert.rejects(verifyMcpOAuthToken(token, deps), (error: unknown) => error instanceof WriterMcpAuthError && error.code === code && error.status === 401, code);
}

test("token válido do Supabase devolve ator, cliente e expiração sem tocar a rede", async () => {
  const identity = await verifyMcpOAuthToken(mint(claims), deps);
  assert.equal(identity.actorId, actorId);
  assert.equal(identity.oauthClientId, claims.client_id);
  assert.equal(identity.issuer, issuer);
  assert.equal(identity.expiresAt, new Date(claims.exp * 1000).toISOString());
});

test("assinatura de outra chave, token expirado e formato inválido são recusados como 401", async () => {
  await rejects(mint(claims, other.privateKey), "invalid_token");
  await rejects(mint({ ...claims, exp: now - 10 }), "invalid_token");
  await rejects("mk_mcp_not_a_jwt", "invalid_token");
  // auth-js devolve AuthError para JWT que não decodifica; o servidor não distingue e responde 401 genérico.
  await rejects("a.b.c", "invalid_token");
});

test("issuer diferente, sub inválido e ausência de client_id são recusados", async () => {
  await rejects(mint({ ...claims, iss: "https://another.supabase.test/auth/v1" }), "token_issuer_mismatch");
  await rejects(mint({ ...claims, sub: "not-a-uuid" }), "invalid_token");
  const { client_id: _omitted, ...withoutClient } = claims;
  void _omitted;
  await rejects(mint(withoutClient), "oauth_client_required");
  await rejects(mint({ ...claims, client_id: "   " }), "oauth_client_required");
});

test("sem issuer configurado a verificação falha com 503 antes de decodificar", async () => {
  await assert.rejects(verifyMcpOAuthToken(mint(claims), { issuer: null, jwks, client }),
    (error: unknown) => error instanceof WriterMcpAuthError && error.code === "mcp_oauth_issuer_missing" && error.status === 503);
});
