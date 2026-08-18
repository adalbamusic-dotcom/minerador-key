import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOpenRouterModel, readOpenRouterModel, writeOpenRouterModel } from "../lib/openrouter-model-config.ts";

test("modelo OpenRouter usa model ID explícito e sem catálogo inventado", () => {
  assert.equal(normalizeOpenRouterModel(" deepseek/deepseek-v4-flash-0731 "), "deepseek/deepseek-v4-flash-0731");
  assert.equal(normalizeOpenRouterModel("provider/model:free"), "provider/model:free");
  assert.equal(normalizeOpenRouterModel("modelo sem provider"), null);
  assert.equal(normalizeOpenRouterModel("provider/model com espaço"), null);
});

test("metadata operacional persiste e faz readback A → B → A sem tocar no health check", () => {
  let metadata: Record<string, unknown> = { label: "OpenRouter", health_check: { status: "ready", current_model: "health/probe-model" } };
  metadata = writeOpenRouterModel(metadata, "provider/model-a");
  assert.equal(readOpenRouterModel(metadata), "provider/model-a");
  metadata = writeOpenRouterModel(metadata, "provider/model-b");
  assert.equal(readOpenRouterModel(metadata), "provider/model-b");
  metadata = writeOpenRouterModel(metadata, "provider/model-a");
  assert.equal(readOpenRouterModel(metadata), "provider/model-a");
  assert.deepEqual(metadata.health_check, { status: "ready", current_model: "health/probe-model" });
});
