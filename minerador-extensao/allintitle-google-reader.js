(() => {
  if (globalThis.__mineradorAllintitleGoogleReaderLoaded) return;
  globalThis.__mineradorAllintitleGoogleReaderLoaded = true;
  const READER_VERSION = 1;
  const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  const classify = (text, expectedQuery) => {
    const compact = String(text || "").replace(/\s+/g, " ").trim();
    if (/recaptcha|unusual traffic|not a robot|detected unusual traffic/i.test(compact)) return { status: "captcha", errorCode: "captcha_detected", message: "CAPTCHA ou desafio humano detectado." };
    if (/before you continue|consent\.google|consentimento|consent to/i.test(compact)) return { status: "blocked", errorCode: "consent_required", message: "Consentimento do Google é necessário." };
    if (/access denied|temporarily blocked|automated queries|sorry\/?index/i.test(compact)) return { status: "blocked", errorCode: "google_blocked", message: "O Google bloqueou ou recusou a consulta." };
    if (document.readyState !== "complete") return { status: "unavailable", errorCode: "page_not_ready", message: "A página do Google ainda não terminou de carregar." };
    const urlQuery = new URL(location.href).searchParams.get("q") || "";
    if (normalize(urlQuery) !== normalize(expectedQuery)) return { status: "unavailable", errorCode: "query_mismatch", message: "A página não confirmou a consulta solicitada." };
    const regions = [document.querySelector("#result-stats"), document.querySelector('[role="status"]'), document.querySelector("body")].filter(Boolean).map((node) => node.textContent || "").join(" ");
    if (/no results found|nenhum resultado encontrado|não foram encontrados resultados/i.test(regions)) return { status: "zero_results", resultsAllintitle: 0 };
    const match = regions.match(/(?:about|aproximadamente)?\s*([\d.,\s]+)\s+(?:results?|resultados?)/i);
    if (!match) return { status: "unavailable", errorCode: "count_unavailable", message: "A página não apresentou contagem confiável." };
    const count = Number(match[1].replace(/[^\d]/g, ""));
    if (!Number.isSafeInteger(count) || count < 0) return { status: "unavailable", errorCode: "count_invalid", message: "A contagem encontrada não é numérica válida." };
    return count === 0 ? { status: "zero_results", resultsAllintitle: 0 } : { status: "success", resultsAllintitle: count };
  };
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action !== "allintitle_read") return;
    try {
      sendResponse({
        ...classify(document.body?.innerText || "", message.expectedQuery),
        requestId: message.requestId,
        keywordId: message.keywordId,
        brandId: message.brandId,
        readerVersion: READER_VERSION,
        diagnosticUrl: location.href,
      });
    } catch (error) {
      sendResponse({ requestId: message.requestId, keywordId: message.keywordId, brandId: message.brandId, readerVersion: READER_VERSION, status: "error", errorCode: "reader_error", message: error?.message || "O leitor não conseguiu analisar a página.", diagnosticUrl: location.href });
    }
  });
})();
