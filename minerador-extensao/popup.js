
const loginView = document.getElementById('loginView');
const minerView = document.getElementById('minerView');
const loginEmailInput = document.getElementById('loginEmail');
const loginPasswordInput = document.getElementById('loginPassword');
const submitLoginBtn = document.getElementById('submitLoginBtn');
const loginStatus = document.getElementById('loginStatus');

const userEmailSpan = document.getElementById('userEmailSpan');
const logoutBtn = document.getElementById('logoutBtn');
const openAppBtn = document.getElementById('openAppBtn');
const connectPanelBtn = document.getElementById('connectPanelBtn');
const connectionStatus = document.getElementById('connectionStatus');
const listSelect = document.getElementById('listSelect');
const brandContainer = document.getElementById('brandContainer');
const brandSelect = document.getElementById('brandSelect');
const brandStatus = document.getElementById('brandStatus');
const listStatus = document.getElementById('listStatus');
const brandsRetryBtn = document.getElementById('brandsRetryBtn');
const listsRetryBtn = document.getElementById('listsRetryBtn');
const brandsDiagnosticEl = document.getElementById('brandsDiagnostic');
const copyBrandsDiagnosticBtn = document.getElementById('copyBrandsDiagnosticBtn');
const closeBrandsDiagnosticBtn = document.getElementById('closeBrandsDiagnosticBtn');

let authorizedBrands = [];
let selectedBrand = null;
let selectedList = null;
let lastBrandsLoad = 0;
let lastListsLoad = 0;

const keywordInput = document.getElementById('keyword');
const locationInput = document.getElementById('location');
const locBrasilInput = document.getElementById('loc-brasil');
const mineBtn = document.getElementById('mineBtn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const copyBtn = document.getElementById('copyBtn');

const extensionConfig = globalThis.MINERADOR_CONFIG || {};

function getExtensionConfig() {
  const required = ['PANEL_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const missing = required.filter(key => !extensionConfig[key]);
  if (missing.length > 0) {
    throw new Error(`Configuração local ausente: ${missing.join(', ')}`);
  }
  return extensionConfig;
}

function getAppOrigin() {
  const configured = getExtensionConfig().PANEL_URL;
  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('PANEL_URL precisa usar uma origem http(s) válida.');
  }
  return url.origin;
}

function getExtensionApiUrl(path) {
  if (typeof path !== 'string' || !path.startsWith('/api/extensao/')) {
    throw new Error('Endpoint da extensão inválido.');
  }
  const url = new URL(path, `${getAppOrigin()}/`);
  if (url.origin !== getAppOrigin()) {
    throw new Error('A API da extensão precisa usar a origem configurada do painel.');
  }
  return url.toString();
}

function getMineradorPanelUrl(brand) {
  if (!brand?.brandRef) throw new Error('Resolva uma marca autorizada antes de abrir o Minerador.');
  const url = new URL(getExtensionConfig().PANEL_URL);
  url.pathname = `/${brand.brandRef}/minerador`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function replaceSelectOptions(select, options) {
  const elements = options.map(({ value, label }) => {
    const option = document.createElement('option');
    option.value = String(value ?? '');
    option.textContent = String(label ?? '');
    return option;
  });
  select.replaceChildren(...elements);
}

function setSelectMessage(select, message) {
  replaceSelectOptions(select, [{ value: '', label: message }]);
}

function setFieldMessage(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('error', isError);
}

function setRetryButton(button, visible, handler) {
  if (!button) return;
  button.style.display = visible ? 'block' : 'none';
  if (visible && handler) button.onclick = handler;
}

async function getStoredExtensionSession() {
  const storage = await chrome.storage.local.get(['supabase_session']);
  const session = storage.supabase_session && typeof storage.supabase_session === 'object'
    ? storage.supabase_session
    : null;
  const accessToken = typeof session?.access_token === 'string' ? session.access_token : '';
  const payload = accessToken ? parseJwt(accessToken) : null;
  const expiresAt = Number(session?.expires_at || (payload?.exp ? Number(payload.exp) * 1000 : 0)) || null;
  return {
    session,
    accessToken,
    refreshToken: typeof session?.refresh_token === 'string' ? session.refresh_token : '',
    expiresAt,
    tokenPresent: Boolean(accessToken),
    tokenExpired: Boolean(expiresAt && expiresAt <= Date.now()),
    sessionUserId: typeof session?.user_id === 'string' ? session.user_id : (typeof payload?.sub === 'string' ? payload.sub : null),
  };
}

async function refreshExtensionSession(session) {
  const refreshToken = typeof session?.refresh_token === 'string' ? session.refresh_token : '';
  if (!refreshToken) {
    const error = new Error('A sessão da extensão expirou. Entre novamente.');
    error.code = 'token_expired';
    error.status = 401;
    throw error;
  }

  const config = getExtensionConfig();
  const response = await fetch(`${config.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: config.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.access_token !== 'string') {
    const error = new Error('A sessão da extensão expirou. Entre novamente.');
    error.code = 'token_expired';
    error.status = response.status || 401;
    throw error;
  }

  const nextSession = {
    access_token: body.access_token,
    refresh_token: typeof body.refresh_token === 'string' ? body.refresh_token : refreshToken,
    expires_at: typeof body.expires_at === 'number'
      ? body.expires_at * 1000
      : Date.now() + Number(body.expires_in || 3600) * 1000,
    email: session.email || null,
    user_id: session.user_id || parseJwt(body.access_token)?.sub || null,
  };
  await chrome.storage.local.set({ supabase_session: nextSession });
  return nextSession;
}

function buildExtensionDiagnostic({ endpoint, status, code, requestId, session, tokenExpired }) {
  const snapshot = session || {};
  return JSON.stringify({
    endpoint,
    status: status ?? null,
    code: code || 'internal_error',
    requestId: requestId || null,
    tokenPresent: Boolean(snapshot.tokenPresent || snapshot.accessToken),
    tokenExpired: Boolean(tokenExpired ?? snapshot.tokenExpired),
    timestamp: new Date().toISOString(),
    extensionVersion: chrome.runtime?.getManifest?.().version || 'unknown',
  }, null, 2);
}

function showBrandsDiagnostic(diagnostic) {
  if (!brandsDiagnosticEl) return;
  brandsDiagnosticEl.value = diagnostic;
  brandsDiagnosticEl.style.display = 'block';
  if (copyBrandsDiagnosticBtn) copyBrandsDiagnosticBtn.style.display = 'block';
  if (closeBrandsDiagnosticBtn) closeBrandsDiagnosticBtn.style.display = 'block';
}

function hideBrandsDiagnostic() {
  if (brandsDiagnosticEl) {
    brandsDiagnosticEl.value = '';
    brandsDiagnosticEl.style.display = 'none';
  }
  if (copyBrandsDiagnosticBtn) copyBrandsDiagnosticBtn.style.display = 'none';
  if (closeBrandsDiagnosticBtn) closeBrandsDiagnosticBtn.style.display = 'none';
}

async function extensionApiFetch(path) {
  const endpoint = getExtensionApiUrl(path);
  let session = await getStoredExtensionSession();
  if (!session.accessToken) {
    const error = new Error('Sessão da extensão não encontrada. Entre novamente.');
    error.code = 'unauthorized';
    error.status = 401;
    error.endpoint = endpoint;
    error.session = session;
    throw error;
  }

  const request = async (currentSession) => {
    try {
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${currentSession.accessToken}` } });
      const body = await response.json().catch(() => ({}));
      return { response, body };
    } catch (cause) {
      const error = new Error('A extensão não conseguiu acessar o servidor local.');
      error.code = 'network_error';
      error.status = null;
      error.endpoint = endpoint;
      error.session = currentSession;
      error.cause = cause;
      throw error;
    }
  };

  let { response, body } = await request(session);
  if (response.status === 401 && body.code === 'token_expired' && session.refreshToken) {
    let refreshed;
    try {
      refreshed = await refreshExtensionSession(session.session);
    } catch (error) {
      error.endpoint = endpoint;
      error.session = session;
      error.tokenExpired = true;
      throw error;
    }
    session = {
      ...session,
      session: refreshed,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: refreshed.expires_at,
      tokenPresent: true,
      tokenExpired: false,
      sessionUserId: refreshed.user_id,
    };
    ({ response, body } = await request(session));
  }
  if (!response.ok) {
    const message = body.message || body.error || (response.status === 401 ? 'Token ausente ou inválido.' : 'Falha ao consultar marcas.');
    const error = new Error(message);
    error.code = body.code || 'internal_error';
    error.status = response.status;
    error.requestId = body.requestId || null;
    error.endpoint = endpoint;
    error.session = session;
    error.tokenExpired = error.code === 'token_expired';
    throw error;
  }
  return body;
}

function saveBrandPreferences() {
  if (!isStorageAvailable) return;
  chrome.storage.local.set({ minerador_extension_preferences: { brandId: selectedBrand?.brandId || null, listId: selectedList?.listId || null, panelOrigin: getAppOrigin() } });
}

async function readBrandPreferences() {
  if (!isStorageAvailable) return {};
  const stored = await chrome.storage.local.get(['minerador_extension_preferences']);
  return stored.minerador_extension_preferences || {};
}

function renderBrandState(message, isError = false) {
  setFieldMessage(brandStatus, message, isError);
  setRetryButton(brandsRetryBtn, isError, () => void loadAuthorizedBrands());
}

function renderListState(message, isError = false) {
  setFieldMessage(listStatus, message, isError);
  setRetryButton(listsRetryBtn, isError, () => void loadListsDropdown(selectedBrand));
}

function clearSelectedBrand() {
  selectedBrand = null;
  selectedList = null;
  brandSelect.disabled = true;
  listSelect.disabled = true;
  setSelectMessage(brandSelect, 'Nenhuma marca disponível para esta conta.');
  setSelectMessage(listSelect, 'Selecione uma marca primeiro');
  renderListState('Selecione uma marca primeiro');
}

async function loadAuthorizedBrands() {
  const loadId = ++lastBrandsLoad;
  hideBrandsDiagnostic();
  authorizedBrands = [];
  chrome.runtime?.sendMessage?.({ action: 'invalidate_minerador_panel_connection' }).catch(() => {});
  clearSelectedBrand();
  brandSelect.disabled = true;
  setSelectMessage(brandSelect, 'Carregando marcas...');
  renderBrandState('Carregando marcas...');
  try {
    const body = await extensionApiFetch('/api/extensao/marcas');
    if (loadId !== lastBrandsLoad) return;
    authorizedBrands = Array.isArray(body.brands) ? body.brands.filter(item => item?.brandId && item?.brandRef && item?.name) : [];
    if (!authorizedBrands.length) {
      setSelectMessage(brandSelect, 'Nenhuma marca disponível para esta conta.');
      renderBrandState('Nenhuma marca disponível para esta conta.');
      return;
    }
    const preferences = await readBrandPreferences();
    const preferred = authorizedBrands.find(brand => brand.brandId === preferences.brandId);
    const brandOptions = authorizedBrands.map(brand => ({ value: brand.brandId, label: brand.name }));
    if (authorizedBrands.length > 1 && !preferred) {
      brandOptions.unshift({ value: '', label: 'Selecione uma marca...' });
    }
    replaceSelectOptions(brandSelect, brandOptions);
    selectedBrand = authorizedBrands.length === 1 ? authorizedBrands[0] : (preferred || null);
    if (selectedBrand) {
      brandSelect.value = selectedBrand.brandId;
      brandSelect.disabled = authorizedBrands.length === 1;
      renderBrandState(authorizedBrands.length === 1 ? selectedBrand.name : `Marca selecionada: ${selectedBrand.name}`);
      await loadListsDropdown(selectedBrand, preferences.listId);
    } else {
      brandSelect.value = '';
      brandSelect.disabled = false;
      setSelectMessage(listSelect, 'Selecione uma marca primeiro');
      renderBrandState('Selecione uma marca autorizada.');
      renderListState('Selecione uma marca primeiro');
    }
  } catch (error) {
    if (loadId !== lastBrandsLoad) return;
    clearSelectedBrand();
    const code = error?.code || 'internal_error';
    const messages = {
      unauthorized: 'Sessão da extensão não encontrada. Entre novamente.',
      token_expired: 'Sua sessão da extensão expirou. Entre novamente.',
      identity_not_linked: 'Sua conta ainda não está vinculada a um perfil autorizado.',
      access_denied: 'Esta conta não possui acesso ao Minerador.',
      no_brands: 'Nenhuma marca autorizada para esta conta.',
      network_error: 'A extensão não conseguiu acessar o servidor configurado.',
      internal_error: 'Falha interna ao consultar marcas.',
    };
    const message = messages[code] || error?.message || messages.internal_error;
    renderBrandState(message, code !== 'no_brands');
    let endpoint = error?.endpoint || null;
    try { endpoint = endpoint || getExtensionApiUrl('/api/extensao/marcas'); } catch {}
    showBrandsDiagnostic(buildExtensionDiagnostic({
      endpoint,
      status: error?.status,
      code,
      requestId: error?.requestId,
      session: error?.session,
      tokenExpired: error?.tokenExpired,
      error,
    }));
  }
  await refreshPanelConnectionStatus();
}

// Verificação de segurança: API de Storage
const isStorageAvailable = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

if (!isStorageAvailable) {
  document.addEventListener('DOMContentLoaded', () => {
    loginStatus.textContent = 'Erro: Chaves pendentes. Acesse chrome://extensions/ e recarregue a extensão.';
    loginStatus.className = 'mt-4 text-sm font-semibold text-center error';
  });
}

// Inicialização: Verifica se há sessão ativa
if (isStorageAvailable) {
  chrome.storage.local.get(['supabase_session'], (result) => {
    if (result.supabase_session && result.supabase_session.access_token) {
      showMinerView(result.supabase_session.email);
    } else {
      showLoginView();
    }
  });
} else {
  showLoginView();
}

async function showMinerView(email) {
  loginView.classList.add('hidden');
  minerView.classList.remove('hidden');
  userEmailSpan.textContent = email;
  clearLoginFields();
  await loadAuthorizedBrands();
}

function setPanelConnectionStatus(state, message) {
  if (connectionStatus) connectionStatus.textContent = message;
  if (connectPanelBtn) connectPanelBtn.textContent = state === 'connected' ? 'Reconectar esta aba do Minerador' : 'Conectar esta aba do Minerador';
}

async function refreshPanelConnectionStatus() {
  setPanelConnectionStatus('checking', 'Verificando conexão com a aba atual...');
  try {
    const response = await chrome.runtime.sendMessage({ action: 'get_minerador_panel_connection', brand: selectedBrand });
    if (!selectedBrand) {
      setPanelConnectionStatus('disconnected', authorizedBrands.length ? 'Selecione uma marca autorizada para conectar.' : 'Nenhuma marca disponível para esta conta.');
      return;
    }
    const codeMessages = { session_missing: 'Marca carregada, mas esta aba ainda não foi conectada.', tab_mismatch: 'A extensão está conectada a outra aba do Minerador.', brand_mismatch: 'A extensão está conectada a outra marca.', actor_mismatch: 'A conexão pertence a outro usuário.', route_mismatch: 'A conexão pertence a outra rota do Minerador.', protocol_mismatch: 'Recarregue a extensão e a página para atualizar o protocolo.', ack_timeout: 'A aba não confirmou o handshake a tempo. Reconecte esta aba.', page_not_ready: 'A página do Minerador ainda não confirmou prontidão para a extensão.', bridge_unavailable: 'Não foi possível comunicar com a extensão nesta aba. Reconecte.', access_not_confirmed: 'O acesso da página não foi confirmado para esta conta e marca.' };
    if (response?.code === 'session_missing') {
      setPanelConnectionStatus('disconnected', `Marca carregada · ${selectedBrand.name || 'marca confirmada'} · Aba ainda não conectada`);
      return;
    }
    if (response?.ok && response.connection?.origin) {
      setPanelConnectionStatus('connected', `Conectado ao Minerador · ${response.connection.brandName || selectedBrand?.name || 'marca confirmada'}`);
      return;
    }
    const messages = {
      incompatible: response?.path ? `Esta aba está em ${response.path}. Abra o Minerador contextual da marca selecionada.` : 'Esta aba não é compatível. Abra o Minerador contextual para conectar.',
      version_incompatible: 'Versão da extensão incompatível. Recarregue a extensão e a página.',
      brand_mismatch: 'A marca selecionada não corresponde à marca aberta no Minerador.',
      lost: 'Conexão perdida. Reconecte esta aba.',
      disconnected: 'Desconectado.'
    };
    setPanelConnectionStatus(response?.state || 'disconnected', codeMessages[response?.code] || messages[response?.state] || response?.error || 'Desconectado.');
  } catch {
    setPanelConnectionStatus('lost', 'Conexão perdida. Reconecte esta aba.');
  }
}

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// Escuta alteração de marca para carregar listas
if (brandSelect) {
  brandSelect.addEventListener('change', () => {
    selectedBrand = authorizedBrands.find(brand => brand.brandId === brandSelect.value) || null;
    selectedList = null;
    saveBrandPreferences();
    chrome.runtime.sendMessage({ action: 'invalidate_minerador_panel_connection' }).catch(() => {});
    void loadListsDropdown(selectedBrand);
    void refreshPanelConnectionStatus();
  });
}

async function loadListsDropdown(brand, preferredListId = null) {
  if (!listSelect) return;
  hideBrandsDiagnostic();
  const loadId = ++lastListsLoad;
  selectedList = null;
  if (!brand?.brandId) {
    listSelect.disabled = true;
    setSelectMessage(listSelect, 'Selecione uma marca primeiro');
    renderListState('Selecione uma marca primeiro');
    return;
  }
  listSelect.disabled = true;
  setSelectMessage(listSelect, 'Carregando listas...');
  try {
    const body = await extensionApiFetch(`/api/extensao/marcas/${encodeURIComponent(brand.brandId)}/listas`);
    if (loadId !== lastListsLoad || selectedBrand?.brandId !== brand.brandId) return;
    const lists = Array.isArray(body.lists) ? body.lists : [];
    if (!lists.length) {
      setSelectMessage(listSelect, 'Nenhuma lista disponível para esta marca.');
      renderListState('Nenhuma lista disponível para esta marca.');
      return;
    }
    replaceSelectOptions(listSelect, lists.map(list => ({ value: list.listId, label: list.name })));
    selectedList = lists.find(list => list.listId === preferredListId) || lists[0];
    listSelect.value = selectedList.listId;
    listSelect.disabled = false;
    renderListState(`Listas autorizadas: ${lists.length}`);
    saveBrandPreferences();
  } catch (err) {
    if (loadId !== lastListsLoad) return;
    listSelect.disabled = true;
    const code = err?.code || 'internal_error';
    const messages = {
      unauthorized: 'Sessão da extensão não encontrada. Entre novamente.',
      token_expired: 'Sua sessão da extensão expirou. Entre novamente.',
      identity_not_linked: 'Sua conta ainda não está vinculada a um perfil autorizado.',
      access_denied: 'Esta conta não possui acesso a esta marca.',
      brand_not_found: 'A marca selecionada não está disponível.',
      network_error: 'A extensão não conseguiu acessar o servidor configurado.',
      internal_error: 'Falha interna ao consultar listas.',
    };
    const message = messages[code] || err?.message || messages.internal_error;
    setSelectMessage(listSelect, message);
    renderListState(message, true);
    let endpoint = err?.endpoint || null;
    try { endpoint = endpoint || getExtensionApiUrl(`/api/extensao/marcas/${encodeURIComponent(brand.brandId)}/listas`); } catch {}
    showBrandsDiagnostic(buildExtensionDiagnostic({
      endpoint,
      status: err?.status,
      code,
      requestId: err?.requestId,
      session: err?.session,
      tokenExpired: err?.tokenExpired,
      error: err,
    }));
  }
}

if (listSelect) {
  listSelect.addEventListener('change', () => {
    selectedList = { listId: listSelect.value };
    saveBrandPreferences();
  });
}

if (brandsRetryBtn) brandsRetryBtn.addEventListener('click', () => void loadAuthorizedBrands());
if (listsRetryBtn) listsRetryBtn.addEventListener('click', () => void loadListsDropdown(selectedBrand));
if (copyBrandsDiagnosticBtn) copyBrandsDiagnosticBtn.addEventListener('click', async () => {
  const text = brandsDiagnosticEl?.value || '';
  try {
    await navigator.clipboard.writeText(text);
    setFieldMessage(brandStatus, 'Diagnóstico copiado.');
  } catch {
    brandsDiagnosticEl?.select();
    document.execCommand('copy');
    setFieldMessage(brandStatus, 'Diagnóstico copiado.');
  }
});
if (closeBrandsDiagnosticBtn) closeBrandsDiagnosticBtn.addEventListener('click', hideBrandsDiagnostic);

function showLoginView() {
  minerView.classList.add('hidden');
  loginView.classList.remove('hidden');
  hideBrandsDiagnostic();
  statusEl.textContent = '';
  resultsEl.classList.add('hidden');
  copyBtn.classList.add('hidden');
  keywordInput.value = '';
  locationInput.value = '';
  authorizedBrands = [];
  selectedBrand = null;
  selectedList = null;
  clearSelectedBrand();
  chrome.runtime?.sendMessage?.({ action: 'invalidate_minerador_panel_connection' }).catch(() => {});
}

function clearLoginFields() {
  loginEmailInput.value = '';
  loginPasswordInput.value = '';
  loginStatus.textContent = '';
  loginStatus.className = 'mt-4 text-sm font-semibold text-center text-gray-500';
}

// Botão de Login
submitLoginBtn.addEventListener('click', async () => {
  try {
    const config = getExtensionConfig();
    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value;

    if (!email || !password) {
      loginStatus.textContent = 'Preencha o e-mail e a senha.';
      loginStatus.className = 'mt-4 text-sm font-semibold text-center error';
      return;
    }

    loginStatus.textContent = 'Autenticando...';
    loginStatus.className = 'mt-4 text-sm font-semibold text-center text-gray-400';
    submitLoginBtn.disabled = true;

    const response = await fetch(`${config.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': config.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error_description || data.message || 'Falha ao autenticar.');
    }

    // Salva a sessão no chrome.storage
    const sessionData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      expires_at: typeof data.expires_at === 'number'
        ? data.expires_at * 1000
        : Date.now() + Number(data.expires_in || 3600) * 1000,
      user_id: data.user?.id || parseJwt(data.access_token)?.sub || null,
      email: data.user.email,
    };

    if (isStorageAvailable) {
      chrome.storage.local.set({ supabase_session: sessionData }, () => {
        showMinerView(data.user.email);
      });
    } else {
      showMinerView(data.user.email);
    }

  } catch (error) {
    console.error('Erro de login:', error);
    loginStatus.textContent = error.message || 'Erro de conexão.';
    loginStatus.className = 'mt-4 text-sm font-semibold text-center error';
  } finally {
    submitLoginBtn.disabled = false;
  }
});

// Botão de Logout
logoutBtn.addEventListener('click', () => {
  if (isStorageAvailable) {
    chrome.storage.local.remove(['supabase_session'], () => {
      showLoginView();
    });
  } else {
    showLoginView();
  }
});

// Botão de Minerar
mineBtn.addEventListener('click', () => {
  const keyword = keywordInput.value.trim();
  
  // Coleta as localidades selecionadas
  const locations = [];
  
  // Checkbox Brasil
  const locBrasil = document.getElementById('loc-brasil');
  if (locBrasil && locBrasil.checked) {
    locations.push('Brasil');
  }
  
  // Checkboxes de Estados
  const checkedStates = document.querySelectorAll('.loc-state:checked');
  checkedStates.forEach(cb => {
    locations.push(cb.value);
  });
  
  // Entrada manual livre (cidades/estados adicionais separados por vírgula)
  const customLocationText = locationInput.value.trim();
  if (customLocationText) {
    customLocationText.split(',').forEach(loc => {
      const trimmed = loc.trim();
      if (trimmed && !locations.includes(trimmed)) {
        locations.push(trimmed);
      }
    });
  }

  if (!keyword) {
    statusEl.textContent = 'Digite uma palavra-chave.';
    return;
  }

  if (locations.length === 0) {
    statusEl.textContent = 'Selecione pelo menos uma localidade.';
    return;
  }

  const listaId = listSelect ? listSelect.value : null;
  if (!selectedBrand?.brandId) {
    statusEl.textContent = 'Resolva uma marca autorizada antes de minerar.';
    return;
  }
  if (!listaId || !selectedList?.listId || selectedList.listId !== listaId) {
    statusEl.textContent = 'Selecione uma lista de destino.';
    return;
  }
  const brandId = selectedBrand.brandId;

  const estimatedTimeSeconds = locations.length * 40;
  statusEl.textContent = `Iniciando... Isso levará cerca de ${estimatedTimeSeconds} segundos (${locations.length} localidade(s)).`;
  
  resultsEl.classList.add('hidden');
  copyBtn.classList.add('hidden');
  mineBtn.disabled = true;

  // Envia a mensagem para o script de background iniciar o trabalho
  chrome.runtime.sendMessage({ action: 'mine', keyword, locations, listaId, marcaId: brandId }, (response) => {
    mineBtn.disabled = false;
    if (response && response.error) {
      statusEl.textContent = response.error;
    } else if (response && response.results) {
      statusEl.textContent = `Concluído: ${response.results.length} palavras encontradas e salvas no Supabase.`;
      resultsEl.value = response.results.join('\n');
      resultsEl.classList.remove('hidden');
      copyBtn.classList.remove('hidden');
    } else {
      statusEl.textContent = 'Erro na mineração ou salvamento.';
    }
  });
});

// Botão de Copiar
copyBtn.addEventListener('click', () => {
  resultsEl.select();
  document.execCommand('copy');
  statusEl.textContent = 'Copiado para a área de transferência!';
});

// Atualiza o progresso em tempo real vindo do script de background
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'mining_progress') {
    statusEl.textContent = `Minerando letra ${message.letter}... (${message.percent}%)`;
  }
});

// Botão para abrir o painel configurado para este ambiente.
if (openAppBtn) {
  openAppBtn.addEventListener('click', () => {
    let panelUrl;
    try {
      panelUrl = getMineradorPanelUrl(selectedBrand);
    } catch (error) {
      statusEl.textContent = error.message;
      return;
    }
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: panelUrl });
    } else {
      window.open(panelUrl, '_blank');
    }
  });
}

if (connectPanelBtn) {
  connectPanelBtn.addEventListener('click', () => {
    connectPanelBtn.disabled = true;
    setPanelConnectionStatus('connecting', 'Conectando e aguardando confirmação da aba...');
    if (!selectedBrand) {
      connectPanelBtn.disabled = false;
      setPanelConnectionStatus('lost', 'Resolva uma marca autorizada antes de conectar.');
      return;
    }
    chrome.runtime.sendMessage({ action: 'connect_minerador_panel', brand: selectedBrand }, (response) => {
      connectPanelBtn.disabled = false;
      if (response?.ok && response.connection?.origin) {
        setPanelConnectionStatus('connected', `Conectado ao Minerador · ${response.connection.brandName || selectedBrand.name}`);
        statusEl.textContent = 'Handshake confirmado. A qualificação pode ser iniciada no Minerador.';
      } else {
        setPanelConnectionStatus(response?.state || 'lost', response?.error || 'Conexão não confirmada pela aba atual.');
        const codeMessages = { session_missing: 'Marca carregada, mas esta aba ainda não foi conectada.', tab_mismatch: 'A extensão está conectada a outra aba do Minerador.', brand_mismatch: 'A extensão está conectada a outra marca.', actor_mismatch: 'A conexão pertence a outro usuário.', route_mismatch: 'A conexão pertence a outra rota do Minerador.', protocol_mismatch: 'Recarregue a extensão e a página para atualizar o protocolo.', ack_timeout: 'A aba não confirmou o handshake a tempo. Reconecte esta aba.', page_not_ready: 'A página do Minerador ainda não confirmou prontidão para a extensão.', bridge_unavailable: 'Não foi possível comunicar com a extensão nesta aba. Reconecte.', access_not_confirmed: 'O acesso da página não foi confirmado para esta conta e marca.' };
        if (response?.code && codeMessages[response.code]) setPanelConnectionStatus(response?.state || 'lost', codeMessages[response.code]);
        statusEl.textContent = response?.error || 'Não foi possível conectar a aba atual.';
      }
    });
  });
}

// Lógica de cache/salvamento automático de preferências de localidade
function saveLocationPreferences() {
  if (!isStorageAvailable) return;
  
  const checkedStates = [];
  document.querySelectorAll('.loc-state:checked').forEach(cb => {
    checkedStates.push(cb.value);
  });

  const preferences = {
    includeBrasil: locBrasilInput ? locBrasilInput.checked : true,
    selectedStates: checkedStates,
    customLocations: locationInput ? locationInput.value.trim() : ''
  };

  chrome.storage.local.set({ location_preferences: preferences }, () => {
    console.log('Preferências de localidade salvas em cache.');
  });
}

function loadLocationPreferences() {
  if (!isStorageAvailable) return;

  chrome.storage.local.get(['location_preferences'], (result) => {
    if (result.location_preferences) {
      const prefs = result.location_preferences;
      
      // Restaura checkbox do Brasil
      if (locBrasilInput) {
        locBrasilInput.checked = prefs.includeBrasil !== false;
      }
      
      // Restaura checkboxes dos estados
      const states = prefs.selectedStates || [];
      document.querySelectorAll('.loc-state').forEach(cb => {
        cb.checked = states.includes(cb.value);
      });
      
      // Restaura entrada manual
      if (locationInput) {
        locationInput.value = prefs.customLocations || '';
      }
    }
  });
}

// Vincula escutas de alteração para salvar no cache do storage
if (isStorageAvailable) {
  if (locBrasilInput) {
    locBrasilInput.addEventListener('change', saveLocationPreferences);
  }
  
  // Utiliza delegação de evento para os estados
  const statesGrid = document.querySelector('.states-grid');
  if (statesGrid) {
    statesGrid.addEventListener('change', saveLocationPreferences);
  }
  
  if (locationInput) {
    locationInput.addEventListener('input', saveLocationPreferences);
  }

  // Carrega as preferências na inicialização
  loadLocationPreferences();
}
