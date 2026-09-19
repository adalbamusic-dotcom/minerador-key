import test from "node:test";
import assert from "node:assert/strict";
import { mcpRuntimeFailure, readMcpRuntimeConfig } from "../lib/server/mcp-runtime-config.ts";

test("MCP local has a stable endpoint and local host allowlist", () => {
  const config = readMcpRuntimeConfig({ NODE_ENV: "development" });
  assert.equal(config.endpoint, "http://localhost:3000/api/mcp/redator");
  assert.deepEqual(config.allowedHosts, ["localhost:3000", "127.0.0.1:3000"]);
  assert.equal(mcpRuntimeFailure(config), null);
});

test("MCP production requires HTTPS and an explicit remote bearer opt-in", () => {
  const missing = readMcpRuntimeConfig({ NODE_ENV: "production", MCP_PUBLIC_BASE_URL: "https://example.vercel.app" });
  assert.equal(missing.endpoint, "https://example.vercel.app/api/mcp/redator");
  assert.equal(mcpRuntimeFailure(missing)?.code, "mcp_remote_bearer_disabled");

  const ready = readMcpRuntimeConfig({ NODE_ENV: "production", MCP_PUBLIC_BASE_URL: "https://example.vercel.app", MCP_ALLOW_REMOTE_BEARER: "true" });
  assert.equal(mcpRuntimeFailure(ready), null);
  assert.ok(ready.allowedHosts.includes("example.vercel.app"));
});

test("MCP production rejects an HTTP public endpoint", () => {
  const config = readMcpRuntimeConfig({ NODE_ENV: "production", MCP_PUBLIC_BASE_URL: "http://example.vercel.app", MCP_ALLOW_REMOTE_BEARER: "true" });
  assert.equal(mcpRuntimeFailure(config)?.code, "mcp_https_required");
});
