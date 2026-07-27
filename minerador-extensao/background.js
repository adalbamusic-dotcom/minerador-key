try {
  importScripts('config.local.js');
} catch {
  console.error('Configuração local da extensão não foi carregada.');
}

const extensionConfig = globalThis.MINERADOR_CONFIG || {};
const ALLINTITLE_DEFAULT_BATCH_SIZE = 5;
const ALLINTITLE_MAX_BATCH_SIZE = 10;
const ALLINTITLE_INTERVAL_MS = 3500;
const ALLINTITLE_ITEM_TIMEOUT_MS = 45000;
const ALLINTITLE_TOTAL_TIMEOUT_MS = 70000;
const allintitleBatches = new Map();
const MINERADOR_PROTOCOL_VERSION = 2;
const MINERADOR_BRIDGE_VERSION = 2;
const HANDSHAKE_TIMEOUT_MS = 5000;
const ALLINTITLE_NAVIGATION_TIMEOUT_MS = 25000;
const pendingHandshakeAcks = new Map();
const debugConnection = (...values) => { if (extensionConfig.DEBUG) console.info('[Minerador extension]', ...values); };
const debugAllintitle = (...values) => { if (extensionConfig.DEBUG) console.info('[Minerador Allintitle]', ...values); };

function getExtensionConfig() {
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const missing = required.filter(key => !extensionConfig[key]);
  if (missing.length > 0) {
    throw new Error(`Configuração local ausente: ${missing.join(', ')}`);
  }
  return extensionConfig;
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'mine') {
    Promise.resolve()
      .then(() => readSelectedBrand(request.brand))
      .then(selectedBrand => requireActiveMineradorConnection(selectedBrand)
        .then(() => executeMining(request.keyword, request.locations, request.listaId, selectedBrand.brandId)))
      .then(results => {
        sendResponse({ results });
      })
      .catch(err => {
        sendResponse({ ok: false, code: err.code || 'mining_error', error: err.message || 'Erro durante a extração.' });
      });
    return true; // Mantém a porta de comunicação aberta para tarefas assíncronas
  }
  if (request.action === 'connect_minerador_panel') {
    connectMineradorPanel(request.brand).then(result => sendResponse(result)).catch(error => sendResponse({ ok: false, code: error.code || 'bridge_unavailable', error: error.message }));
    return true;
  }
  if (request.action === 'get_minerador_panel_connection') {
    inspectMineradorPanelConnection(request.brand).then(result => sendResponse(result)).catch(error => sendResponse({ ok: false, code: error.code || 'bridge_unavailable', error: error.message }));
    return true;
  }
  if (request.action === 'invalidate_minerador_panel_connection') {
    invalidateMineradorPanelConnections().then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (request.action === 'minerador_handshake_ack') {
    acceptMineradorHandshakeAck(request.payload, sender);
    return;
  }
  if (request.action === 'minerador_page_handshake_stage') {
    markMineradorHandshakeStage(request.payload, sender);
    sendResponse({ ok: true });
    return;
  }
  if (request.action === 'minerador_page_handshake_ready') {
    sendResponse({ ok: true });
    return;
  }
  if (request.action === 'allintitle_bridge_request') {
    handleAllintitleBridgeRequest(request.payload, sender)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, type: 'bridge_error', requestId: request.payload?.requestId, code: error.code || 'bridge_unavailable', message: error.message || 'Falha na comunicação da extensão.', session: error.session || null, diagnostic: error.diagnostic || null }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(connectionKey(tabId)).catch(() => {});
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function buildAllintitleQuery(keyword) {
  return `allintitle:"${String(keyword).replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim()}"`;
}

const BRAND_REF_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*--[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractMineradorBrandRef(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const match = url.pathname.match(/^\/([^/]+)\/minerador\/?$/i);
    return match && BRAND_REF_PATTERN.test(match[1]) ? match[1] : null;
  } catch { return null; }
}

function canonicalMineradorPath(rawUrl) {
  const brandRef = extractMineradorBrandRef(rawUrl);
  return brandRef ? `/${brandRef}/minerador` : null;
}

function connectionFailure(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.session = details.session || null;
  error.details = details;
  error.diagnostic = details.diagnostic || null;
  return error;
}

function handshakeDiagnostic({ requestId, bridgeReady, pathname, brand, lastConfirmedStage }) {
  return {
    requestId,
    lastConfirmedStage: lastConfirmedStage || 'bridge_ready',
    bridgeVersion: bridgeReady?.bridgeVersion || null,
    bridgeInstanceId: bridgeReady?.instanceId || null,
    protocolVersion: MINERADOR_PROTOCOL_VERSION,
    pathname,
    brandId: brand?.brandId || null,
    brandRef: brand?.brandRef || null,
    timestamp: new Date().toISOString(),
  };
}

function validatePageHandshakeReady(pageReady, expected) {
  if (!pageReady || pageReady.type !== 'minerador_page_handshake_ready') return connectionFailure('page_not_ready', 'A página do Minerador ainda não confirmou prontidão para o handshake.');
  if (pageReady.protocolVersion !== MINERADOR_PROTOCOL_VERSION) return connectionFailure('protocol_mismatch', 'A página do Minerador usa uma versão incompatível.');
  if (pageReady.accessConfirmed !== true) return connectionFailure('access_not_confirmed', 'A página não confirmou acesso operacional ao Minerador.');
  if (pageReady.activeBrandId !== expected.brandId || pageReady.activeBrandRef !== expected.brandRef) return connectionFailure('brand_mismatch', 'A prontidão da página pertence a outra marca.');
  if (pageReady.pathname !== expected.pathname) return connectionFailure('route_mismatch', 'A prontidão da página pertence a outra rota.');
  if (expected.actorUserId && pageReady.actorUserId !== expected.actorUserId) return connectionFailure('actor_mismatch', 'A prontidão da página pertence a outro usuário.');
  return null;
}

function markMineradorHandshakeStage(payload, sender) {
  const pending = pendingHandshakeAcks.get(payload?.requestId);
  const tabId = sender?.tab?.id;
  if (!pending || !tabId || pending.tabId !== tabId) return;
  if (!['page_ping_received', 'page_ack_dispatched'].includes(payload?.stage)) return;
  pending.lastConfirmedStage = payload.stage;
}

function runtimeFailureCode(error) {
  const message = error?.message || String(error || '');
  return /extension context invalidated|context invalidated|receiving end does not exist|could not establish connection|message port closed/i.test(message)
    ? 'bridge_context_invalidated'
    : 'bridge_unavailable';
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, response => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(connectionFailure(runtimeFailureCode(runtimeError), runtimeError.message || 'A bridge da aba deixou de responder.'));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(connectionFailure(runtimeFailureCode(error), error?.message || 'A bridge da aba deixou de responder.'));
    }
  });
}

function readSelectedBrand(value) {
  if (!value || typeof value !== 'object') throw new Error('Selecione uma marca autorizada antes de conectar.');
  const brandId = typeof value.brandId === 'string' ? value.brandId.trim() : '';
  const brandRef = typeof value.brandRef === 'string' ? value.brandRef.trim() : '';
  const brandName = typeof value.brandName === 'string' ? value.brandName.trim() : '';
  if (!brandId || !brandRef || !BRAND_REF_PATTERN.test(brandRef)) throw new Error('A marca selecionada não foi validada pelo servidor.');
  return { brandId, brandRef, brandName };
}

async function connectMineradorPanel(selectedBrand) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Nenhuma aba ativa foi encontrada.');
  return confirmMineradorPanelConnection(tab.id, tab.url || '', readSelectedBrand(selectedBrand));
}

function panelOrigin(url) { try { return new URL(url).origin; } catch { return ''; } }

function isAllowedMineradorPanelUrl(url) {
  try {
    const parsed = new URL(url);
    const configuredOrigin = extensionConfig.PANEL_URL ? new URL(extensionConfig.PANEL_URL).origin : null;
    const allowed = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);
    if (configuredOrigin) allowed.add(configuredOrigin);
    return allowed.has(parsed.origin) && extractMineradorBrandRef(url) !== null;
  } catch { return false; }
}

function connectionKey(tabId) { return `minerador:panel-connection:${tabId}`; }

async function readStoredPanelConnection(tabId) {
  const stored = await chrome.storage.session.get(connectionKey(tabId));
  return stored[connectionKey(tabId)] || null;
}

async function readStoredPanelConnections() {
  const stored = await chrome.storage.session.get(null);
  return Object.entries(stored)
    .filter(([key, value]) => key.startsWith('minerador:panel-connection:') && value && typeof value === 'object')
    .map(([, value]) => value);
}

function sessionForDiagnostic(connection) {
  if (!connection || typeof connection !== 'object') return null;
  return {
    tabId: connection.tabId,
    origin: connection.origin,
    pathname: connection.pathname || null,
    module: connection.module,
    protocolVersion: connection.protocolVersion,
    bridgeVersion: connection.bridgeVersion || null,
    bridgeInstanceId: connection.bridgeInstanceId || null,
    bridgeReadyAt: connection.bridgeReadyAt || null,
    actorUserId: connection.actorUserId,
    brandId: connection.brandId,
    brandRef: connection.brandRef,
    brandName: connection.brandName,
    confirmedAt: connection.confirmedAt,
    lastPingAt: connection.lastPingAt,
  };
}

function validateStoredConnection(connection, tabId, expected = {}) {
  if (!connection) return connectionFailure('session_missing', 'A marca foi carregada, mas esta aba ainda não foi conectada.');
  if (connection.tabId !== tabId) return connectionFailure('tab_mismatch', 'A extensão está conectada a outra aba do Minerador.', { session: sessionForDiagnostic(connection) });
  if (connection.protocolVersion !== MINERADOR_PROTOCOL_VERSION) return connectionFailure('protocol_mismatch', 'Recarregue a extensão para usar o protocolo atual.', { session: sessionForDiagnostic(connection) });
  if (expected.origin && connection.origin !== expected.origin) return connectionFailure('route_mismatch', 'A conexão pertence a outra origem do Minerador.', { session: sessionForDiagnostic(connection) });
  if (expected.actorUserId && connection.actorUserId !== expected.actorUserId) return connectionFailure('actor_mismatch', 'A conexão pertence a outro usuário.', { session: sessionForDiagnostic(connection) });
  if (expected.brandId && connection.brandId !== expected.brandId) return connectionFailure('brand_mismatch', 'A extensão está conectada a outra marca.', { session: sessionForDiagnostic(connection) });
  if (expected.brandRef && connection.brandRef !== expected.brandRef) return connectionFailure('brand_mismatch', 'A extensão está conectada a outra marca.', { session: sessionForDiagnostic(connection) });
  if (expected.pathname && connection.pathname !== expected.pathname) return connectionFailure('route_mismatch', 'A conexão pertence a outra rota do Minerador.', { session: sessionForDiagnostic(connection) });
  return null;
}

async function assertPreflightSession(tabId, expected = {}) {
  const connection = await readStoredPanelConnection(tabId);
  const storedError = validateStoredConnection(connection, tabId, expected);
  if (storedError?.code === 'session_missing') {
    const otherConnections = await readStoredPanelConnections();
    const sameContext = otherConnections.find(item => (!expected.brandId || item.brandId === expected.brandId) && (!expected.brandRef || item.brandRef === expected.brandRef));
    if (sameContext) return connectionFailure('tab_mismatch', 'A extensão está conectada a outra aba do Minerador.', { session: sessionForDiagnostic(sameContext) });
  }
  if (storedError) throw storedError;
  return connection;
}

async function requireActiveMineradorConnection(selectedBrand) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Abra e mantenha ativa a aba contextual do Minerador antes de minerar.');
  const connection = await readStoredPanelConnection(tab.id);
  if (!connection) throw connectionFailure('session_missing', 'Conecte a aba do Minerador da marca selecionada antes de minerar.');
  if (connection.brandId !== selectedBrand.brandId || connection.brandRef !== selectedBrand.brandRef) throw connectionFailure('brand_mismatch', 'A extensão está conectada a outra marca.', { session: sessionForDiagnostic(connection) });
  await confirmMineradorPanelConnection(tab.id, tab.url || '', selectedBrand);
  return readStoredPanelConnection(tab.id);
}

async function invalidateMineradorPanelConnections() {
  const stored = await chrome.storage.session.get(null);
  const keys = Object.keys(stored).filter(key => key.startsWith('minerador:panel-connection:'));
  if (keys.length) await chrome.storage.session.remove(keys);
}

async function confirmMineradorPanelConnection(tabId, knownUrl, selectedBrand, expected = {}) {
  const tab = knownUrl ? { id: tabId, url: knownUrl } : await chrome.tabs.get(tabId);
  const stored = await readStoredPanelConnection(tabId);
  const brand = selectedBrand ? readSelectedBrand(selectedBrand) : readSelectedBrand(stored);
  const pathname = canonicalMineradorPath(tab?.url || '');
  if (!tab?.id || !isAllowedMineradorPanelUrl(tab.url || '') || !pathname) throw connectionFailure('route_mismatch', 'Abra a rota contextual do Minerador desta marca.', { session: sessionForDiagnostic(stored) });
  if (extractMineradorBrandRef(tab.url || '') !== brand.brandRef) throw connectionFailure('brand_mismatch', 'A extensão está conectada a outra marca.', { session: sessionForDiagnostic(stored) });
  if (expected.pathname && pathname !== expected.pathname) throw connectionFailure('route_mismatch', 'A conexão pertence a outra rota do Minerador.', { session: sessionForDiagnostic(stored) });
  const origin = panelOrigin(tab.url);
  debugConnection('tabId identificado', tabId, origin);
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['minerador-panel-bridge.js'] });
  } catch (error) {
    throw connectionFailure(runtimeFailureCode(error), 'Não foi possível reinjetar a bridge na aba do Minerador.', { session: sessionForDiagnostic(stored) });
  }
  debugConnection('bridge injetado', tabId);
  const bridgeReadyRequestId = crypto.randomUUID();
  let bridgeReady;
  try {
    bridgeReady = await sendTabMessage(tabId, { action: 'minerador_bridge_probe', requestId: bridgeReadyRequestId, protocolVersion: MINERADOR_PROTOCOL_VERSION });
  } catch (error) {
    throw connectionFailure(error.code || 'bridge_unavailable', 'A bridge foi injetada, mas não confirmou uma instância operacional.', { session: sessionForDiagnostic(stored) });
  }
  if (!bridgeReady || bridgeReady.type !== 'bridge_ready') {
    throw connectionFailure('bridge_not_ready', 'A bridge da aba não confirmou disponibilidade.', { session: sessionForDiagnostic(stored) });
  }
  if (bridgeReady.protocolVersion !== MINERADOR_PROTOCOL_VERSION || bridgeReady.bridgeVersion !== MINERADOR_BRIDGE_VERSION) {
    throw connectionFailure('bridge_version_mismatch', 'A bridge da aba usa uma versão incompatível.', { session: sessionForDiagnostic(stored), bridgeReady });
  }
  debugConnection('bridge pronta', tabId, bridgeReady.instanceId);
  const requestId = crypto.randomUUID();
  const pageReadyError = validatePageHandshakeReady(bridgeReady.pageReady, {
    actorUserId: expected.actorUserId || stored?.actorUserId || null,
    brandId: brand.brandId,
    brandRef: brand.brandRef,
    pathname,
  });
  if (pageReadyError) {
    throw connectionFailure(pageReadyError.code, pageReadyError.message, {
      session: sessionForDiagnostic(stored),
      diagnostic: handshakeDiagnostic({ requestId, bridgeReady, pathname, brand, lastConfirmedStage: 'bridge_ready' }),
    });
  }
  const ack = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const pending = pendingHandshakeAcks.get(requestId);
      pendingHandshakeAcks.delete(requestId);
      reject(connectionFailure('ack_timeout', 'A aba do Minerador não confirmou o handshake a tempo.', {
        session: sessionForDiagnostic(stored),
        diagnostic: handshakeDiagnostic({ requestId, bridgeReady, pathname, brand, lastConfirmedStage: pending?.lastConfirmedStage || 'page_handshake_ready' }),
      }));
    }, HANDSHAKE_TIMEOUT_MS);
    pendingHandshakeAcks.set(requestId, { tabId, origin, pathname, selectedBrandId: brand.brandId, selectedBrandRef: brand.brandRef, expectedActorUserId: expected.actorUserId || stored?.actorUserId || null, confirmedAt: stored?.confirmedAt || null, resolve, reject, timeout, extensionVersion: chrome.runtime.getManifest?.().version || 'unknown', bridgeReady, lastConfirmedStage: 'page_handshake_ready' });
  });
  const pendingBeforePing = pendingHandshakeAcks.get(requestId);
  if (pendingBeforePing) pendingBeforePing.lastConfirmedStage = 'ping_sent';
  debugConnection('ping enviado', requestId);
  try {
    await sendTabMessage(tabId, {
      action: 'minerador_handshake_ping',
      requestId,
      module: 'minerador',
      protocolVersion: MINERADOR_PROTOCOL_VERSION,
      extensionVersion: chrome.runtime.getManifest?.().version || 'unknown',
      selectedBrandId: brand.brandId,
      selectedBrandRef: brand.brandRef,
      origin,
      pathname,
    });
  } catch (error) {
    const pending = pendingHandshakeAcks.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingHandshakeAcks.delete(requestId);
    }
    throw connectionFailure(error.code || 'bridge_unavailable', 'Não foi possível enviar o ping para a aba do Minerador.', { session: sessionForDiagnostic(stored) });
  }
  const connection = await ack;
  await chrome.storage.session.set({ [connectionKey(tabId)]: connection });
  postToPanel(tabId, { type: 'extension_available', version: MINERADOR_PROTOCOL_VERSION, connection });
  debugConnection('ACK confirmado', requestId);
  return { ok: true, type: 'panel_connected', connection };
}

function acceptMineradorHandshakeAck(payload, sender) {
  const pending = pendingHandshakeAcks.get(payload?.requestId);
  const tabId = sender.tab?.id;
  if (!pending || !tabId || pending.tabId !== tabId) return;
  if (payload.protocolVersion !== MINERADOR_PROTOCOL_VERSION) {
    clearTimeout(pending.timeout); pendingHandshakeAcks.delete(payload.requestId); pending.reject(connectionFailure('protocol_mismatch', 'Versão do protocolo incompatível.')); return;
  }
  if (payload.origin !== pending.origin || payload.module !== 'minerador' || typeof payload.ack !== 'boolean') {
    clearTimeout(pending.timeout); pendingHandshakeAcks.delete(payload.requestId); pending.reject(connectionFailure('route_mismatch', 'ACK com origem, módulo ou formato incompatível.')); return;
  }
  if (payload.ack !== true) {
    const code = ['access_not_confirmed', 'brand_mismatch', 'actor_mismatch', 'route_mismatch'].includes(payload.errorCode) ? payload.errorCode : 'access_not_confirmed';
    clearTimeout(pending.timeout); pendingHandshakeAcks.delete(payload.requestId); pending.reject(connectionFailure(code, code === 'brand_mismatch' ? 'A marca ativa da página não corresponde à marca selecionada.' : 'A página não confirmou acesso operacional ao Minerador.')); return;
  }
  if (payload.authenticated !== true || payload.accessConfirmed !== true) {
    clearTimeout(pending.timeout); pendingHandshakeAcks.delete(payload.requestId); pending.reject(connectionFailure('access_not_confirmed', 'Acesso da página não foi confirmado.')); return;
  }
  if (payload.activeBrandId !== pending.selectedBrandId || payload.activeBrandRef !== pending.selectedBrandRef) {
    clearTimeout(pending.timeout); pendingHandshakeAcks.delete(payload.requestId); pending.reject(connectionFailure('brand_mismatch', 'A extensão está conectada a outra marca.')); return;
  }
  if (pending.expectedActorUserId && payload.actorUserId !== pending.expectedActorUserId) {
    clearTimeout(pending.timeout); pendingHandshakeAcks.delete(payload.requestId); pending.reject(connectionFailure('actor_mismatch', 'A conexão pertence a outro usuário.')); return;
  }
  if (typeof payload.actorUserId !== 'string' || !payload.actorUserId || typeof payload.activeBrandName !== 'string' || payload.pathname !== pending.pathname || typeof payload.timestamp !== 'string') {
    clearTimeout(pending.timeout); pendingHandshakeAcks.delete(payload.requestId); pending.reject(connectionFailure('route_mismatch', 'ACK sem rota, identidade ou marca confirmada.')); return;
  }
  pending.lastConfirmedStage = 'background_ack_received';
  clearTimeout(pending.timeout); pendingHandshakeAcks.delete(payload.requestId);
  const now = new Date().toISOString();
  pending.resolve({ tabId, origin: pending.origin, pathname: pending.pathname, module: 'minerador', protocolVersion: MINERADOR_PROTOCOL_VERSION, extensionVersion: pending.extensionVersion, bridgeVersion: pending.bridgeReady?.bridgeVersion || null, bridgeInstanceId: pending.bridgeReady?.instanceId || null, bridgeReadyAt: pending.bridgeReady?.timestamp || null, actorUserId: payload.actorUserId, brandId: payload.activeBrandId, brandRef: payload.activeBrandRef, brandName: payload.activeBrandName, confirmedAt: pending.confirmedAt || now, lastPingAt: now });
}

async function inspectMineradorPanelConnection(selectedBrand) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, state: 'disconnected', error: 'Nenhuma aba ativa foi encontrada.' };
  try { const result = await confirmMineradorPanelConnection(tab.id, tab.url || '', readSelectedBrand(selectedBrand)); return { ...result, state: 'connected' }; }
  catch (error) {
    const stateByCode = { protocol_mismatch: 'version_incompatible', bridge_version_mismatch: 'version_incompatible', brand_mismatch: 'brand_mismatch', session_missing: 'disconnected', tab_mismatch: 'lost', route_mismatch: 'incompatible', ack_timeout: 'lost', page_not_ready: 'lost', bridge_not_ready: 'lost', bridge_context_invalidated: 'lost', bridge_unavailable: 'lost', actor_mismatch: 'lost', access_not_confirmed: 'lost' };
    const state = stateByCode[error.code] || (isAllowedMineradorPanelUrl(tab.url || '') ? 'lost' : 'incompatible');
    let path = '';
    try { path = new URL(tab.url || '').pathname || '/'; } catch {}
    return { ok: false, state, code: error.code || 'bridge_unavailable', path, error: error.message, session: error.session || null, diagnostic: error.diagnostic || null };
  }
}

function postToPanel(tabId, payload) {
  if (!tabId) return;
  void sendTabMessage(tabId, { action: 'allintitle_panel_event', payload }).catch(() => {});
}

function postAllintitleProgress(state, item, stage, details = {}) {
  const payload = { ...details, type: 'minerador.allintitle.progress.v1', batchId: state.batchId, requestId: state.requestId, keywordId: item.keywordId, brandId: state.brandId, stage, protocolVersion: MINERADOR_PROTOCOL_VERSION, measuredAt: new Date().toISOString() };
  debugAllintitle(stage, payload.requestId, payload.keywordId, details.errorCode || '');
  postToPanel(state.panelTabId, payload);
}

function allintitleError(stage, errorCode, message) {
  const error = new Error(message);
  error.stage = stage;
  error.errorCode = errorCode;
  return error;
}

function terminalAllintitleResult(state, item, status, details = {}) {
  return {
    ...details,
    type: 'minerador.allintitle.result.v1',
    batchId: state.batchId,
    requestId: state.requestId,
    keywordId: item.keywordId,
    brandId: state.brandId,
    keyword: item.keyword,
    query: buildAllintitleQuery(item.keyword),
    status,
    source: 'google_search_extension',
    measuredAt: new Date().toISOString(),
    protocolVersion: MINERADOR_PROTOCOL_VERSION,
  };
}

function withAllintitleTimeout(operation, timeoutMs, onTimeout) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(onTimeout()), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function validateAllintitleRequest(payload) {
  if (typeof payload?.requestId !== 'string' || !payload.requestId.trim()) throw new Error('Lote sem requestId.');
  if (!payload || payload.type !== 'minerador.allintitle.measure.v1') throw new Error('Contrato de medição inválido.');
  if (!payload.batchId || !payload.brandId || !Array.isArray(payload.items)) throw new Error('Lote sem batchId, marca ou itens válidos.');
  if (payload.items.length === 0 || payload.items.length > ALLINTITLE_MAX_BATCH_SIZE) throw new Error(`O lote deve conter entre 1 e ${ALLINTITLE_MAX_BATCH_SIZE} keywords.`);
  const seen = new Set();
  for (const item of payload.items) {
    if (!item?.keywordId || !item?.keyword || !String(item.keyword).trim()) throw new Error('Cada item precisa de keywordId e keyword real.');
    if (seen.has(item.keywordId)) throw new Error('O lote possui keywordId duplicado.');
    seen.add(item.keywordId);
  }
}

async function persistTransientBatch(state) {
  await chrome.storage.session.set({ [`allintitle:${state.batchId}`]: { batchId: state.batchId, requestId: state.requestId, brandId: state.brandId, index: state.index, paused: state.paused, panelTabId: state.panelTabId } });
}

async function handleAllintitleBridgeRequest(payload, sender) {
  const panelTabId = sender.tab?.id;
  if (!panelTabId) throw new Error('A solicitação deve vir da aba conectada do Minerador.');
  if (payload?.type === 'minerador.allintitle.probe.v1') {
    const expected = payload.context && typeof payload.context === 'object' ? payload.context : {};
    await assertPreflightSession(panelTabId, expected);
    const result = await confirmMineradorPanelConnection(panelTabId, '', undefined, expected);
    return { ok: true, type: 'extension_available', version: MINERADOR_PROTOCOL_VERSION, requestId: payload.requestId, code: 'connected', message: 'Conexão operacional validada.', connection: result.connection, preflight: { connected: true, code: 'connected', message: 'Conexão operacional validada.', session: sessionForDiagnostic(result.connection) } };
  }
  if (payload?.type === 'minerador.allintitle.cancel.v1') return cancelAllintitleBatch(payload.batchId, 'cancelled', payload.requestId || null);
  if (payload?.type === 'minerador.allintitle.resume.v1') {
    const expected = payload.context && typeof payload.context === 'object' ? payload.context : {};
    await assertPreflightSession(panelTabId, expected);
    await confirmMineradorPanelConnection(panelTabId, '', undefined, expected);
    return resumeAllintitleBatch(payload.batchId, panelTabId, payload.requestId || null);
  }
  validateAllintitleRequest(payload);
  const expected = payload.context && typeof payload.context === 'object' ? payload.context : {};
  const connectionResult = await confirmMineradorPanelConnection(panelTabId, '', undefined, expected);
  const connection = connectionResult.connection;
  if (payload.brandId !== connection.brandId) throw new Error('A marca do lote não corresponde à sessão confirmada da extensão.');
  if (allintitleBatches.has(payload.batchId)) throw new Error('Este lote já está em execução.');
  const state = { ...payload, actorUserId: connection.actorUserId, panelTabId, index: 0, tabId: null, paused: false, cancelled: false, startedAt: Date.now(), intervalMs: Math.max(ALLINTITLE_INTERVAL_MS, Number(payload.options?.intervalMs) || ALLINTITLE_INTERVAL_MS) };
  allintitleBatches.set(state.batchId, state);
  await persistTransientBatch(state);
  void runAllintitleBatch(state);
  return { ok: true, type: 'batch_started', requestId: state.requestId, batchId: state.batchId, brandId: state.brandId, keywordId: state.items.length === 1 ? state.items[0].keywordId : null, keywordIds: state.items.map(item => item.keywordId), accepted: state.items.length };
}

async function ensureAllintitleTab(state, item) {
  if (state.tabId) {
    try { await chrome.tabs.get(state.tabId); postAllintitleProgress(state, item, 'opening_google_tab', { tabId: state.tabId, reused: true }); return state.tabId; }
    catch { state.tabId = null; }
  }
  postAllintitleProgress(state, item, 'opening_google_tab', { reused: false });
  const tab = await chrome.tabs.create({ url: 'https://www.google.com/', active: false });
  if (!tab.id) throw allintitleError('opening_google_tab', 'google_tab_create_failed', 'Não foi possível criar a aba de medição.');
  state.tabId = tab.id;
  return tab.id;
}

function isExpectedGoogleSearchUrl(rawUrl, expectedQuery) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname === 'consent.google.com') return true;
    return (url.hostname === 'www.google.com' || url.hostname === 'www.google.com.br') && url.pathname === '/search' && url.searchParams.get('q') === expectedQuery;
  } catch { return false; }
}

function waitForTabComplete(tabId, expectedQuery, timeoutMs = ALLINTITLE_NAVIGATION_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let sawLoading = false;
    const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(allintitleError('loading_query', 'navigation_timeout', 'A consulta do Google não terminou de carregar.')); }, timeoutMs);
    const listener = (changedTabId, changeInfo, tab) => {
      if (changedTabId !== tabId) return;
      if (changeInfo.status === 'loading') sawLoading = true;
      if (sawLoading && changeInfo.status === 'complete') {
        clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener);
        if (!isExpectedGoogleSearchUrl(tab?.url || '', expectedQuery)) return reject(allintitleError('loading_query', 'unexpected_navigation', 'O Google redirecionou para uma página diferente da consulta solicitada.'));
        resolve(tab);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function measureAllintitleItem(state, item) {
  const tabId = await ensureAllintitleTab(state, item);
  const query = buildAllintitleQuery(item.keyword);
  const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  postAllintitleProgress(state, item, 'loading_query', { tabId, diagnosticUrl: targetUrl });
  const complete = waitForTabComplete(tabId, query);
  try { await chrome.tabs.update(tabId, { url: targetUrl }); await complete; }
  catch (error) { throw error?.stage ? error : allintitleError('loading_query', 'navigation_failed', error?.message || 'Não foi possível abrir a consulta no Google.'); }
  postAllintitleProgress(state, item, 'injecting_reader', { tabId });
  try { await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['allintitle-google-reader.js'] }); }
  catch (error) { throw allintitleError('injecting_reader', 'reader_injection_failed', error?.message || 'Não foi possível preparar o leitor da página.'); }
  postAllintitleProgress(state, item, 'reading_page', { tabId });
  let parsed;
  try { parsed = await chrome.tabs.sendMessage(tabId, { action: 'allintitle_read', requestId: state.requestId, keywordId: item.keywordId, brandId: state.brandId, expectedQuery: query }); }
  catch (error) { throw allintitleError('reading_page', 'reader_no_response', error?.message || 'A extensão conectada, mas o leitor não respondeu.'); }
  if (!parsed || parsed.readerVersion !== 1) throw allintitleError('reading_page', 'reader_version_mismatch', 'O leitor da página não confirmou uma versão compatível.');
  if (parsed.requestId !== state.requestId || parsed.keywordId !== item.keywordId || parsed.brandId !== state.brandId) throw allintitleError('reading_page', 'reader_response_mismatch', 'A resposta do leitor não corresponde à operação atual.');
  postAllintitleProgress(state, item, 'returning_result', { tabId, diagnosticUrl: parsed.diagnosticUrl });
  return { ...parsed, type: 'minerador.allintitle.result.v1', batchId: state.batchId, requestId: state.requestId, keywordId: item.keywordId, brandId: state.brandId, keyword: item.keyword, query, source: 'google_search_extension', measuredAt: new Date().toISOString(), stage: 'validating_result', protocolVersion: MINERADOR_PROTOCOL_VERSION };
}

async function runAllintitleBatch(state) {
  while (!state.cancelled && !state.paused && state.index < state.items.length) {
    const item = state.items[state.index];
    let result;
    try {
      if (Date.now() - state.startedAt > ALLINTITLE_TOTAL_TIMEOUT_MS) throw allintitleError('timeout', 'batch_timeout', 'A operação allintitle excedeu o tempo limite total.');
      result = await withAllintitleTimeout(measureAllintitleItem(state, item), ALLINTITLE_ITEM_TIMEOUT_MS, () => allintitleError('timeout', 'measurement_timeout', 'A consulta allintitle excedeu o tempo limite.'));
    }
    catch (error) {
      const status = error?.stage === 'timeout' ? 'timeout' : 'error';
      result = terminalAllintitleResult(state, item, status, { stage: error?.stage || 'failed', errorCode: error?.errorCode || 'measurement_error', message: error?.message || 'Falha técnica na medição.' });
      postAllintitleProgress(state, item, result.stage, { tabId: state.tabId, errorCode: result.errorCode, message: result.message });
    }
    try {
      postToPanel(state.panelTabId, result);
      if (result.status === 'captcha' || result.status === 'blocked') { state.paused = true; await chrome.tabs.update(state.tabId, { active: true }).catch(() => {}); postToPanel(state.panelTabId, { type: 'batch_paused', requestId: state.requestId, batchId: state.batchId, brandId: state.brandId, keywordId: item.keywordId, status: result.status }); await persistTransientBatch(state); return; }
      state.index += 1;
      await persistTransientBatch(state);
      if (state.index < state.items.length) await sleep(state.intervalMs);
    } catch (error) {
      const terminal = terminalAllintitleResult(state, item, 'error', { stage: 'failed', errorCode: 'background_response_failed', message: error?.message || 'A extensão não conseguiu concluir o retorno da medição.' });
      postToPanel(state.panelTabId, terminal);
      state.cancelled = true;
      allintitleBatches.delete(state.batchId);
      await chrome.storage.session.remove(`allintitle:${state.batchId}`).catch(() => {});
      return;
    }
  }
  if (!state.cancelled && !state.paused) { postToPanel(state.panelTabId, { type: 'batch_completed', requestId: state.requestId, batchId: state.batchId, brandId: state.brandId, keywordId: state.items.length === 1 ? state.items[0].keywordId : null, keywordIds: state.items.map(item => item.keywordId) }); allintitleBatches.delete(state.batchId); await chrome.storage.session.remove(`allintitle:${state.batchId}`); }
}

async function resumeAllintitleBatch(batchId, panelTabId, requestId = null) {
  const state = allintitleBatches.get(batchId);
  if (requestId && state && requestId !== state.requestId) throw allintitleError('returning_result', 'request_mismatch', 'Retomada divergente.');
  if (!state || state.cancelled) throw new Error('Lote não está disponível para retomada.');
  state.panelTabId = panelTabId; state.paused = false; await persistTransientBatch(state); void runAllintitleBatch(state);
  return { ok: true, type: 'batch_resumed', requestId: state.requestId, batchId, brandId: state.brandId };
}

async function cancelAllintitleBatch(batchId, status, requestId = null) {
  const state = allintitleBatches.get(batchId);
  if (requestId && state && requestId !== state.requestId) throw allintitleError('returning_result', 'request_mismatch', 'Cancelamento divergente.');
  if (!state) return { ok: true, type: 'batch_cancelled', requestId, batchId };
  state.cancelled = true;
  for (let index = state.index; index < state.items.length; index += 1) { const item = state.items[index]; postToPanel(state.panelTabId, { type: 'minerador.allintitle.result.v1', batchId, requestId: state.requestId, keywordId: item.keywordId, brandId: state.brandId, keyword: item.keyword, query: buildAllintitleQuery(item.keyword), status, source: 'google_search_extension', measuredAt: new Date().toISOString() }); }
  allintitleBatches.delete(batchId); await chrome.storage.session.remove(`allintitle:${batchId}`);
  postToPanel(state.panelTabId, { type: 'batch_cancelled', requestId: state.requestId, batchId, brandId: state.brandId, keywordId: state.items.length === 1 ? state.items[0].keywordId : null, keywordIds: state.items.slice(state.index).map(item => item.keywordId) });
  return { ok: true, type: 'batch_cancelled', requestId: state.requestId, batchId, brandId: state.brandId };
}

async function executeMining(baseKeyword, locations, listaId, marcaId) {
  const config = getExtensionConfig();
  // 1. Verifica se o usuário está autenticado na extensão antes de iniciar o processamento
  const storage = await chrome.storage.local.get(['supabase_session']);
  const token = storage.supabase_session ? storage.supabase_session.access_token : null;

  if (!token) {
    throw new Error('Não autorizado. Por favor, realize o login na extensão.');
  }

  if (!baseKeyword || !baseKeyword.trim()) {
    throw new Error('A palavra-chave semente é obrigatória.');
  }

  if (!locations || !Array.isArray(locations) || locations.length === 0) {
    throw new Error('Pelo menos uma localidade é obrigatória.');
  }

  // 2. Busca as keywords que já existem no banco de dados para esta lista para evitar duplicidade
  const existingKeywords = new Set();
  if (listaId) {
    try {
      const queryUrl = `${config.SUPABASE_URL}/rest/v1/keywords_kgr?select=keyword&lista_id=eq.${encodeURIComponent(listaId)}&brand_id=eq.${encodeURIComponent(marcaId)}`;
      const response = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          'apikey': config.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        data.forEach(item => {
          if (item.keyword) {
            existingKeywords.add(item.keyword.toLowerCase().trim());
          }
        });
        console.log(`Deduplicação: carregadas ${existingKeywords.size} palavras existentes para a lista ${listaId}.`);
      }
    } catch (err) {
      console.error("Erro ao buscar keywords existentes para deduplicação:", err);
    }
  }

  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
  let allKeywords = new Set();
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const palavrasNegativas = ['grátis', 'gratis', 'curso', 'pdf', 'barato', 'caseiro', 'reclame aqui'];

  const totalLocations = locations.length;
  let currentLocIndex = 0;

  for (const loc of locations) {
    currentLocIndex++;
    const currentKeywords = new Set();
    console.log(`Iniciando mineração para localidade: ${loc}`);

    let letterIndex = 0;
    for (const letter of alphabet) {
      letterIndex++;
      
      // Calcula progresso global considerando todas as localidades selecionadas
      const percent = Math.round(
        ((currentLocIndex - 1) / totalLocations * 100) + 
        (letterIndex / 26 * (100 / totalLocations))
      );

      chrome.runtime.sendMessage({ 
        action: 'mining_progress', 
        letter: `${letter.toUpperCase()} (${loc})`, 
        percent 
      }).catch(() => {});

      // Se a localidade for 'Brasil', faz a busca nacional (sem concatenar cidade/estado)
      const query = loc === 'Brasil' 
        ? `${baseKeyword} ${letter}` 
        : `${baseKeyword} ${letter} ${loc}`;

      const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`;
      
      try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && data[1]) {
          data[1].forEach(suggestion => {
            const lowerSuggestion = suggestion.toLowerCase();
            const wordCount = lowerSuggestion.split(' ').length;
            const hasNegativeWord = palavrasNegativas.some(neg => lowerSuggestion.includes(neg));

            if (wordCount >= 3 && !hasNegativeWord) {
              currentKeywords.add(suggestion);
              allKeywords.add(suggestion);
            }
          });
        }
      } catch (error) {
        console.error(`Erro ao buscar a letra ${letter} para a localidade ${loc}:`, error);
      }
      
      await sleep(1500); // Evitar rate limit do Google
    }

    const resultadosLocais = Array.from(currentKeywords);

    // ---- INTEGRAÇÃO SUPABASE (INÍCIO) ----
    // Filtra apenas as que não existem no banco de dados para evitar duplicidade
    const novasPalavras = resultadosLocais.filter(kw => !existingKeywords.has(kw.toLowerCase().trim()));

    if (novasPalavras.length > 0) {
      const supabaseKeywordsUrl = `${config.SUPABASE_URL}/rest/v1/keywords_kgr`;
      // Monta o lote de dados específico desta localidade com o listaId
      const payload = novasPalavras.map(kw => {
        const item = {
          keyword: kw,
          location: loc,
          status: 'bruto',
          lista_id: listaId
        };
        item.brand_id = marcaId;
        return item;
      });

      try {
        const response = await fetch(supabaseKeywordsUrl, {
          method: 'POST',
          headers: {
            'apikey': config.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`Falha ao gravar os dados de ${loc} no banco.`);
        }
        console.log(`Dados da localidade ${loc} enviados ao Supabase com sucesso (${novasPalavras.length} novas palavras).`);
      } catch (error) {
        console.error(`Erro ao salvar ${loc} no Supabase:`, error);
        throw new Error(`Erro ao salvar localidade ${loc} no banco de dados. Verifique a conexão.`);
      }
    }
  }

  return Array.from(allKeywords);
}
