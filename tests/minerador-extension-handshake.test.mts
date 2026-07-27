import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { MINERADOR_EXTENSION_PROTOCOL_VERSION, extractMineradorBrandRef, isAllowedMineradorPanelUrl, isValidMineradorHandshakeAck } from "../lib/minerador/extension-handshake.ts";

const brandId = "9f7b1d84-54a5-4bd2-aee0-1136d4a7f64f";
const brandRef = `adalba-pro--${brandId}`;
const origin = "http://localhost:3000";

test("extrai brandRef sem convertê-lo em brandId", () => {
  assert.equal(extractMineradorBrandRef(`${origin}/${brandRef}/minerador`), brandRef);
  assert.equal(extractMineradorBrandRef(`${origin}/${brandRef}/minerador/?status=publicado#keyword-1`), brandRef);
  assert.equal(extractMineradorBrandRef(`${origin}/minerador`), null);
  assert.equal(extractMineradorBrandRef(`${origin}/${brandRef}/arquiteto`), null);
  assert.equal(extractMineradorBrandRef(`${origin}/admin/marcas`), null);
});

test("aceita somente Minerador contextual na origem autorizada", () => {
  assert.equal(isAllowedMineradorPanelUrl(`${origin}/${brandRef}/minerador`), true);
  assert.equal(isAllowedMineradorPanelUrl(`${origin}/${brandRef}/minerador/`), true);
  assert.equal(isAllowedMineradorPanelUrl(`${origin}/${brandRef}/minerador?brand=x#keyword-1`), true);
  assert.equal(isAllowedMineradorPanelUrl("http://127.0.0.1:3000/adalba-pro--9f7b1d84-54a5-4bd2-aee0-1136d4a7f64f/minerador"), true);
  assert.equal(isAllowedMineradorPanelUrl("https://app.example.com/adalba-pro--9f7b1d84-54a5-4bd2-aee0-1136d4a7f64f/minerador", "https://app.example.com"), true);
  assert.equal(isAllowedMineradorPanelUrl(`${origin}/minerador`), false);
  assert.equal(isAllowedMineradorPanelUrl(`${origin}/${brandRef}/arquiteto`), false);
  assert.equal(isAllowedMineradorPanelUrl("https://unexpected.example/adalba-pro--9f7b1d84-54a5-4bd2-aee0-1136d4a7f64f/minerador"), false);
});

test("ACK v2 exige identidade, acesso e a mesma marca", () => {
  const pathname = `/${brandRef}/minerador`;
  const expected = { requestId: "request-1", origin, pathname, selectedBrandId: brandId, selectedBrandRef: brandRef };
  const ack = {
    ...expected,
    pathname,
    ack: true,
    module: "minerador",
    protocolVersion: MINERADOR_EXTENSION_PROTOCOL_VERSION,
    authenticated: true,
    accessConfirmed: true,
    actorUserId: "actor-1",
    activeBrandId: brandId,
    activeBrandRef: brandRef,
    activeBrandName: "Adalba Pro",
    timestamp: "2026-07-25T12:00:00.000Z",
  };
  assert.equal(isValidMineradorHandshakeAck(ack, expected), true);
  assert.equal(isValidMineradorHandshakeAck({ ...ack, activeBrandId: "other-brand" }, expected), false);
  assert.equal(isValidMineradorHandshakeAck({ ...ack, activeBrandRef: "other--ref" }, expected), false);
  assert.equal(isValidMineradorHandshakeAck({ ...ack, accessConfirmed: false }, expected), false);
  assert.equal(isValidMineradorHandshakeAck({ ...ack, protocolVersion: 1 }, expected), false);
  assert.equal(isValidMineradorHandshakeAck({ ...ack, requestId: "other" }, expected), false);
  assert.equal(isValidMineradorHandshakeAck({ ...ack, pathname: "/outra-rota/minerador" }, expected), false);
  assert.equal(isValidMineradorHandshakeAck({ ...ack, timestamp: undefined }, expected), false);
});

test("popup usa endpoints autenticados, seleção real e rota contextual", async () => {
  const popup = await readFile(new URL("../minerador-extensao/popup.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../minerador-extensao/popup.html", import.meta.url), "utf8");
  assert.match(popup, /Authorization: `Bearer \$\{currentSession\.accessToken\}`/);
  assert.match(popup, /\/api\/extensao\/marcas/);
  assert.match(popup, /\/listas/);
  assert.match(popup, /function getExtensionApiUrl/);
  assert.match(popup, /body\.message \|\| body\.error/);
  assert.match(popup, /buildExtensionDiagnostic/);
  assert.match(popup, /refreshExtensionSession/);
  assert.match(popup, /url\.pathname = `\/\$\{brand\.brandRef\}\/minerador`/);
  assert.match(popup, /invalidate_minerador_panel_connection/);
  assert.match(html, />Marca</);
  assert.match(html, />Salvar na Lista \/ Projeto</);
  assert.match(html, /brandsDiagnostic/);
  assert.match(html, /Copiar diagnóstico/);
  assert.match(popup, /Nenhuma marca disponível para esta conta/);
});

test("background exige a marca no ping e no gate das operações", async () => {
  const background = await readFile(new URL("../minerador-extensao/background.js", import.meta.url), "utf8");
  const bridge = await readFile(new URL("../minerador-extensao/minerador-panel-bridge.js", import.meta.url), "utf8");
  assert.match(background, /const MINERADOR_PROTOCOL_VERSION = 2/);
  assert.match(background, /selectedBrandId/);
  assert.match(background, /selectedBrandRef/);
  assert.match(background, /activeBrandId/);
  assert.match(background, /invalidate_minerador_panel_connection/);
  assert.match(background, /payload\.brandId !== connection\.brandId/);
  assert.match(background, /chrome\.storage\.session\.set/);
  assert.match(background, /opening_google_tab/);
  assert.match(bridge, /\.\.\.message/);
  assert.match(bridge, /minerador:extension-handshake-ack/);
});

test("rotas server-side exigem bearer, capacidade e filtro tenantizado", async () => {
  const brands = await readFile(new URL("../app/api/extensao/marcas/route.ts", import.meta.url), "utf8");
  const lists = await readFile(new URL("../app/api/extensao/marcas/[brandId]/listas/route.ts", import.meta.url), "utf8");
  assert.match(brands, /requireExtensionSessionProfile/);
  assert.match(brands, /listAccessibleTenantIds/);
  assert.match(brands, /canAccessTenantModule/);
  assert.match(brands, /buildBrandRef/);
  assert.match(lists, /requireTenantPermission/);
  assert.match(lists, /\.eq\("marca_id", context\.brandId\)/);
  assert.match(lists, /item\.marca_id === context\.brandId/);
});
