(() => {
  const BRIDGE_VERSION = 2;
  const PROTOCOL_VERSION = 2;
  const previous = globalThis.__mineradorAllintitleBridge;

  // A content-script global can survive an extension reload. The previous
  // instance is therefore disposable, not a boolean "already loaded" flag.
  if (previous && typeof previous.dispose === "function") {
    try { previous.dispose(); } catch {}
  }

  const instanceId = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `bridge-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let disposed = false;
  const pendingRequestIds = new Set();
  let pageReady = null;

  const debug = (...values) => {
    if (globalThis.MINERADOR_EXTENSION_DEBUG) console.info("[Minerador extension]", ...values);
  };

  const emit = (detail) => {
    if (disposed) return;
    window.dispatchEvent(new CustomEvent("minerador:allintitle-response", { detail }));
  };

  const runtimeErrorCode = (error) => {
    const message = error?.message || String(error || "");
    return /extension context invalidated|context invalidated|receiving end does not exist|could not establish connection|message port closed/i.test(message)
      ? "bridge_context_invalidated"
      : "bridge_unavailable";
  };

  const runtimeOperational = () => {
    try {
      return typeof chrome !== "undefined"
        && Boolean(chrome.runtime)
        && typeof chrome.runtime.sendMessage === "function";
    } catch {
      return false;
    }
  };

  const extensionVersion = () => {
    try { return chrome.runtime.getManifest?.().version || "unknown"; } catch { return "unknown"; }
  };

  const readyDetail = () => ({
    type: "bridge_ready",
    bridgeVersion: BRIDGE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    instanceId,
    extensionVersion: extensionVersion(),
    timestamp: new Date().toISOString(),
  });

  const emitBridgeError = (requestId, code, message) => {
    emit({ type: "bridge_error", requestId: requestId || null, code, message });
  };

  const normalizePageReady = (detail) => {
    if (!detail || typeof detail !== "object" || detail.type !== "minerador_page_handshake_ready") return null;
    if (typeof detail.actorUserId !== "string" || typeof detail.activeBrandId !== "string" || typeof detail.activeBrandRef !== "string" || typeof detail.pathname !== "string") return null;
    return {
      type: "minerador_page_handshake_ready",
      actorUserId: detail.actorUserId,
      activeBrandId: detail.activeBrandId,
      activeBrandRef: detail.activeBrandRef,
      activeBrandName: typeof detail.activeBrandName === "string" ? detail.activeBrandName : "",
      pathname: detail.pathname,
      accessConfirmed: detail.accessConfirmed === true,
      protocolVersion: detail.protocolVersion,
      timestamp: typeof detail.timestamp === "string" ? detail.timestamp : new Date().toISOString(),
    };
  };

  const sendRuntimeMessage = (message) => new Promise(resolve => {
    if (disposed || !runtimeOperational()) {
      resolve({ ok: false, code: "bridge_context_invalidated", message: "O contexto da extensão não está mais operacional." });
      return;
    }
    try {
      chrome.runtime.sendMessage(message, response => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          resolve({ ok: false, code: runtimeErrorCode(lastError), message: lastError.message || "A extensão deixou de responder." });
          return;
        }
        resolve({ ok: true, response });
      });
    } catch (error) {
      resolve({ ok: false, code: runtimeErrorCode(error), message: error?.message || "A extensão deixou de responder." });
    }
  });

  function onPageHandshakeReady(event) {
    const normalized = normalizePageReady(event?.detail);
    if (!normalized) return;
    pageReady = normalized;
    void sendRuntimeMessage({ action: "minerador_page_handshake_ready", payload: normalized });
  }

  function onAllintitleRequest(event) {
    if (disposed) return;
    const detail = event?.detail;
    if (!detail || typeof detail !== "object") return;
    const requestId = typeof detail.requestId === "string" ? detail.requestId : null;
    pendingRequestIds.add(requestId);
    void sendRuntimeMessage({ action: "allintitle_bridge_request", payload: detail }).then(result => {
      pendingRequestIds.delete(requestId);
      if (disposed) return;
      if (!result.ok) {
        emitBridgeError(requestId, result.code, result.message);
      } else if (result.response) {
        emit({ ...result.response, requestId });
      } else {
        emitBridgeError(requestId, "bridge_empty_response", "A extensão não retornou resposta para a solicitação.");
      }
    });
  }

  function onRuntimeMessage(message, _sender, sendResponse) {
    if (disposed) return false;
    if (message?.action === "minerador_bridge_probe") {
      window.dispatchEvent(new CustomEvent("minerador:page-handshake-request"));
      const ready = readyDetail();
      const response = { ...ready, pageReady };
      window.dispatchEvent(new CustomEvent("minerador:allintitle-response", { detail: response }));
      sendResponse?.(response);
      return false;
    }
    if (message?.action === "minerador_handshake_ping") {
      debug("ping recebido", message.requestId, instanceId);
      window.dispatchEvent(new CustomEvent("minerador:extension-handshake-ping", { detail: { ...message, bridgeVersion: BRIDGE_VERSION, bridgeInstanceId: instanceId } }));
      void sendRuntimeMessage({ action: "minerador_page_handshake_stage", payload: { requestId: message.requestId, stage: "page_ping_received", bridgeVersion: BRIDGE_VERSION, protocolVersion: PROTOCOL_VERSION } });
      return false;
    }
    if (message?.action === "allintitle_panel_event") emit(message.payload);
    return false;
  }

  function onHandshakeAck(event) {
    if (disposed) return;
    const detail = event?.detail;
    if (!detail || typeof detail !== "object") return;
    debug("ACK recebido da página", detail.requestId, instanceId);
    void sendRuntimeMessage({ action: "minerador_page_handshake_stage", payload: { requestId: detail.requestId, stage: "page_ack_dispatched", bridgeVersion: BRIDGE_VERSION, protocolVersion: PROTOCOL_VERSION } })
      .then(() => sendRuntimeMessage({ action: "minerador_handshake_ack", payload: detail }))
      .then(result => { if (!result.ok) emitBridgeError(detail.requestId, result.code, result.message); });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    pendingRequestIds.clear();
    try { window.removeEventListener("minerador:allintitle-request", onAllintitleRequest); } catch {}
    try { window.removeEventListener("minerador:page-handshake-ready", onPageHandshakeReady); } catch {}
    try { window.removeEventListener("minerador:extension-handshake-ack", onHandshakeAck); } catch {}
    try { chrome.runtime.onMessage.removeListener(onRuntimeMessage); } catch {}
    if (globalThis.__mineradorAllintitleBridge?.instanceId === instanceId) {
      globalThis.__mineradorAllintitleBridge = null;
    }
  }

  const instance = { bridgeVersion: BRIDGE_VERSION, protocolVersion: PROTOCOL_VERSION, instanceId, dispose };
  globalThis.__mineradorAllintitleBridge = instance;
  window.addEventListener("minerador:allintitle-request", onAllintitleRequest);
  window.addEventListener("minerador:page-handshake-ready", onPageHandshakeReady);
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  window.addEventListener("minerador:extension-handshake-ack", onHandshakeAck);

  if (!runtimeOperational()) {
    emitBridgeError(null, "bridge_context_invalidated", "O contexto da extensão não está mais operacional.");
    return;
  }
  emit(readyDetail());
})();
