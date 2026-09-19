import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const redatorRoute = readFileSync(new URL("../app/api/redator/mcp-delegations/route.ts", import.meta.url), "utf8");
const agencyRoute = readFileSync(new URL("../app/api/agencies/[agencyRef]/integrations/route.ts", import.meta.url), "utf8");

test("a emissão e a revogação MCP pertencem à Agência, não ao Redator", () => {
  assert.doesNotMatch(redatorRoute, /issueWriterMcpDelegation/);
  assert.doesNotMatch(redatorRoute, /revokeWriterMcpDelegation/);
  assert.match(redatorRoute, /MCP_DELEGATION_AGENCY_ONLY/);
  assert.match(agencyRoute, /create_writer_mcp_delegation/);
  assert.match(agencyRoute, /revoke_writer_mcp_delegation/);
  assert.match(agencyRoute, /revoke_mcp_client/);
  // Fase 4: acessos OAuth são revogados/reativados pela Agência; bearer só com opt-in da Plataforma.
  assert.match(agencyRoute, /revoke_writer_mcp_grant/);
  assert.match(agencyRoute, /reactivate_writer_mcp_grant/);
  assert.match(agencyRoute, /MCP_BEARER_DISABLED/);
});

test("a rota legada do Redator conserva somente a leitura compatível", () => {
  assert.match(redatorRoute, /export async function GET/);
  assert.match(redatorRoute, /listWriterMcpDelegations/);
  assert.match(redatorRoute, /status: 410/);
});
