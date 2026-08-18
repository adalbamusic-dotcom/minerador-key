import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("mock HTTP 400 preserva diagnóstico sanitizado sem retry ou segredo", async () => {
  const source = await readFile(new URL("lib/server/communication/resend-provider.ts", root), "utf8");
  const { stripTypeScriptTypes } = await import("node:module") as unknown as { stripTypeScriptTypes: (input: string, options: { mode: "transform" }) => string };
  const executable = stripTypeScriptTypes(source.replace(/^import "server-only";\s*/m, ""), { mode: "transform" });
  const provider = await import(`data:text/javascript,${encodeURIComponent(executable)}`);
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init: init || {} });
    return new Response(JSON.stringify({ name: "validation_error", message: "Invalid request; token=hidden" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await provider.sendWithResend({
      destination: "destination@example.invalid",
      senderEmail: "sender@example.invalid",
      subject: "Teste",
      text: "Texto de teste",
      html: "<p>Texto de teste</p>",
      idempotencyKey: "communication-test-mock",
      apiKey: "mock-secret",
    });

    assert.equal(calls.length, 1);
    assert.equal(result.status, "FAILED");
    assert.equal(result.provider, "resend");
    assert.equal(result.errorCode, "RESEND_HTTP_400");
    assert.equal(result.providerErrorType, "validation_error");
    assert.match(result.providerErrorMessage || "", /Invalid request/);
    assert.doesNotMatch(result.providerErrorMessage || "", /hidden|secret|token/i);
    assert.equal(result.providerHttpStatus, 400);
    assert.doesNotMatch(JSON.stringify(result), /mock-secret|Authorization|destination@example\.invalid/i);

    const request = calls[0];
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.init.method, "POST");
    const headers = request.init.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(headers["Idempotency-Key"], "communication-test-mock");
    assert.ok(headers.Authorization);
    assert.ok(headers["Idempotency-Key"].length >= 1 && headers["Idempotency-Key"].length <= 256);
    assert.deepEqual(JSON.parse(String(request.init.body)), {
      from: "sender@example.invalid",
      to: ["destination@example.invalid"],
      subject: "Teste",
      text: "Texto de teste",
      html: "<p>Texto de teste</p>",
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});
