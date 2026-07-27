import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("bridge é uma instância versionada e descartável", async () => {
  const bridge = await readFile(new URL("../minerador-extensao/minerador-panel-bridge.js", import.meta.url), "utf8");
  assert.doesNotMatch(bridge, /__mineradorAllintitleBridgeLoaded/);
  assert.match(bridge, /__mineradorAllintitleBridge/);
  assert.match(bridge, /BRIDGE_VERSION = 2/);
  assert.match(bridge, /PROTOCOL_VERSION = 2/);
  assert.match(bridge, /previous\.dispose\(\)/);
  assert.match(bridge, /function dispose\(\)/);
  assert.match(bridge, /removeEventListener\("minerador:allintitle-request", onAllintitleRequest\)/);
  assert.match(bridge, /removeListener\(onRuntimeMessage\)/);
  assert.match(bridge, /instanceId/);
});

test("bridge informa readiness, probe e contexto invalidado", async () => {
  const bridge = await readFile(new URL("../minerador-extensao/minerador-panel-bridge.js", import.meta.url), "utf8");
  const background = await readFile(new URL("../minerador-extensao/background.js", import.meta.url), "utf8");
  assert.match(bridge, /type: "bridge_ready"/);
  assert.match(bridge, /extensionVersion: extensionVersion\(\)/);
  assert.match(bridge, /action === "minerador_bridge_probe"/);
  assert.match(bridge, /bridge_context_invalidated/);
  assert.match(bridge, /chrome\.runtime\.lastError/);
  assert.match(bridge, /function onAllintitleRequest/);
  assert.match(bridge, /function onRuntimeMessage/);
  assert.match(bridge, /function onHandshakeAck/);
  assert.match(background, /MINERADOR_BRIDGE_VERSION = 2/);
  assert.match(background, /minerador_bridge_probe/);
  assert.match(background, /bridge_not_ready/);
  assert.match(background, /bridge_version_mismatch/);
  assert.match(background, /HANDSHAKE_TIMEOUT_MS = 5000/);
  assert.match(background, /payload\.ack !== true/);
  assert.match(background, /await sendTabMessage\(tabId, \{\s*action: 'minerador_handshake_ping'/);
  const page = await readFile(new URL("../modules/minerador/minerador-extension-handshake-responder.tsx", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/(brand)/[brandRef]/minerador/page.tsx", import.meta.url), "utf8");
  assert.match(workspace, /ALLINTITLE_PREFLIGHT_TIMEOUT_MS = 7000/);
  assert.match(page, /minerador_page_handshake_ready/);
  assert.match(page, /minerador:extension-handshake-ping/);
  assert.match(page, /minerador:extension-handshake-ack/);
  assert.match(page, /removeEventListener/);
  assert.match(route, /requireTenantModule/);
  assert.match(route, /MineradorExtensionHandshakeResponder/);
});

test("bridge e diagnóstico não dependem de chamada externa", async () => {
  const bridge = await readFile(new URL("../minerador-extensao/minerador-panel-bridge.js", import.meta.url), "utf8");
  assert.doesNotMatch(bridge, /google\.com|rapidapi/i);
});
