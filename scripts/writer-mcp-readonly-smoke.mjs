// Local development smoke. Reads an ephemeral bearer from stdin; never prints or stores it.
const token = (await new Promise((resolve, reject) => {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => { input += chunk; if (input.includes("\n")) { process.stdin.pause(); resolve(input.trim()); } });
  process.stdin.on("end", () => resolve(input.trim()));
  process.stdin.on("error", reject);
}));
if (!/^mk_mcp_[A-Za-z0-9_-]{40,}$/.test(token)) throw new Error("invalid_test_credential");

async function call(id, method, params) {
  const response = await fetch("http://localhost:3000/api/mcp/redator", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status} ${raw.slice(0, 200)}`);
  const payload = response.headers.get("content-type")?.includes("text/event-stream")
    ? raw.split(/\r?\n/).filter(line => line.startsWith("data: ")).at(-1)?.slice(6)
    : raw;
  const parsed = JSON.parse(payload || "null");
  if (parsed.error) throw new Error(`${method}: ${parsed.error.message || "protocol_error"}`);
  return parsed.result;
}

const toolResult = async (id, name, args) => {
  const response = await call(id, "tools/call", { name, arguments: args });
  if (response.isError) throw new Error(`${name}: ${response.content?.[0]?.text || "tool_error"}`);
  return JSON.parse(response.content?.find(item => item.type === "text")?.text || "null").result;
};

const initialized = await call(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "writer-readonly-smoke", version: "1" } });
const listed = await call(2, "tools/list", {});
const profile = await toolResult(3, "get_writer_connection_profile", {});
const documents = await toolResult(4, "list_writer_documents", { limit: 10 });
if (!Array.isArray(documents)) throw new Error("documents_not_listed");
let brief = null;
if (documents[0]) brief = await toolResult(5, "get_writer_brief", { documentId: documents[0].id });
console.log(JSON.stringify({ server: initialized.serverInfo?.name, tools: listed.tools?.length,
  delegatedBrandPresent: Boolean(profile.brandId),
  documentCount: documents.length, briefRead: Boolean(brief?.documentId), dossierPresent: Boolean(brief?.dossier),
}));
