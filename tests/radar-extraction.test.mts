import assert from "node:assert/strict";
import test from "node:test";
import { CompetitorExtractionError, extractCompetitorPage, validateExternalUrl } from "../lib/radar/competitor-extractor.ts";

test("extrator bloqueia protocolos e destinos privados", () => {
  assert.throws(() => validateExternalUrl("file:///etc/passwd"), (error: unknown) => error instanceof CompetitorExtractionError && error.code === "invalid_url");
  assert.throws(() => validateExternalUrl("http://127.0.0.1/admin"), (error: unknown) => error instanceof CompetitorExtractionError && error.code === "private_destination");
  assert.throws(() => validateExternalUrl("http://localhost/admin"), (error: unknown) => error instanceof CompetitorExtractionError && error.code === "private_destination");
});

test("extrator usa fixture HTML e retorna campos estruturais", async () => {
  const html = "<html><head><title>Guia de pacientes</title><meta name=\"description\" content=\"Meta\"><link rel=\"canonical\" href=\"/guia\"><script type=\"application/ld+json\">{\"@type\":\"Article\"}</script></head><body><h1>Guia</h1><h2>Captação</h2><p>Texto editorial com termos recorrentes e informação suficiente para a fixture.</p><ul><li>Item</li></ul><table><tr><td>Comparação</td></tr></table><a href=\"/outra\">Interna</a><a href=\"https://other.example/fonte\">Externa</a></body></html>";
  const page = await extractCompetitorPage("https://example.com/guia", { lookupImpl: (async () => [{ address: "93.184.216.34" }]) as never, fetchImpl: (async () => new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })) as never, now: "2026-07-20T12:00:00.000Z" });
  assert.equal(["success", "partial"].includes(page.status), true);
  assert.equal(page.title, "Guia de pacientes");
  assert.equal(page.h1[0], "Guia");
  assert.equal(page.internalLinkCount, 1);
  assert.equal(page.externalLinkCount, 1);
  assert.deepEqual(page.structuredDataTypes, ["Article"]);
});

test("extrator rejeita resposta que não seja HTML", async () => {
  await assert.rejects(() => extractCompetitorPage("https://example.com/data", { lookupImpl: (async () => [{ address: "93.184.216.34" }]) as never, fetchImpl: (async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })) as never }), (error: unknown) => error instanceof CompetitorExtractionError && error.code === "invalid_content_type");
});
