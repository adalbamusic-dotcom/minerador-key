import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("background mantém preflight estruturado por aba, sessão e contexto", async () => {
  const background = await readFile(new URL("../minerador-extensao/background.js", import.meta.url), "utf8");
  for (const code of ["connected", "session_missing", "tab_mismatch", "brand_mismatch", "actor_mismatch", "route_mismatch", "protocol_mismatch", "ack_timeout", "bridge_not_ready", "bridge_context_invalidated", "bridge_version_mismatch", "bridge_unavailable", "access_not_confirmed"]) {
    assert.match(background, new RegExp(`['\"]${code}['\"]`));
  }
  assert.match(background, /assertPreflightSession/);
  assert.match(background, /chrome\.storage\.session\.get/);
  assert.match(background, /connectionKey\(tabId\)/);
  assert.match(background, /pathname/);
  assert.match(background, /preflight: \{ connected: true/);
});

test("página contextual envia contexto real e não reduz o preflight a um booleano", async () => {
  const page = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  assert.match(page, /buildExtensionPreflightContext/);
  assert.match(page, /actorUserId: session\?\.user\?\.id/);
  assert.match(page, /pathname: window\.location\.pathname/);
  assert.match(page, /const preflight = await confirmAllintitleExtensionConnection\(\)/);
  assert.match(page, /if \(!preflight\.connected\)/);
  assert.match(page, /preflight\.code/);
  assert.match(page, /diagnostic: preflight\.diagnostic/);
  assert.doesNotMatch(page, /Extensão não conectada\. Abra a extensão nesta aba/);
});

test("popup diferencia marca carregada de sessão conectada", async () => {
  const popup = await readFile(new URL("../minerador-extensao/popup.js", import.meta.url), "utf8");
  assert.match(popup, /Marca carregada/);
  assert.match(popup, /session_missing/);
  assert.match(popup, /Conectado ao Minerador/);
  assert.match(popup, /chrome\.runtime\.sendMessage\(\{ action: 'get_minerador_panel_connection'/);
});

test("bridge preserva o requestId e a resposta estruturada do background", async () => {
  const bridge = await readFile(new URL("../minerador-extensao/minerador-panel-bridge.js", import.meta.url), "utf8");
  assert.match(bridge, /emit\(\{ \.\.\.result\.response, requestId \}\)/);
  assert.match(bridge, /bridge_empty_response/);
  assert.doesNotMatch(bridge, /requestId: detail\.requestId, \.\.\.response/);
  assert.match(bridge, /minerador:extension-handshake-ack/);
});
