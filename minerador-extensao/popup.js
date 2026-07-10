
const loginView = document.getElementById('loginView');
const minerView = document.getElementById('minerView');
const loginEmailInput = document.getElementById('loginEmail');
const loginPasswordInput = document.getElementById('loginPassword');
const submitLoginBtn = document.getElementById('submitLoginBtn');
const loginStatus = document.getElementById('loginStatus');

const userEmailSpan = document.getElementById('userEmailSpan');
const logoutBtn = document.getElementById('logoutBtn');
const openAppBtn = document.getElementById('openAppBtn');
const listSelect = document.getElementById('listSelect');
const brandContainer = document.getElementById('brandContainer');
const brandSelect = document.getElementById('brandSelect');

let currentProfile = null;

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

  try {
    const config = getExtensionConfig();
    const storage = await chrome.storage.local.get(['supabase_session']);
    const token = storage.supabase_session ? storage.supabase_session.access_token : null;
    if (!token) return;

    const payload = parseJwt(token);
    const userId = payload ? payload.sub : null;
    if (!userId) throw new Error('Não foi possível identificar o ID do usuário.');

    // 1. Busca perfil do usuário
    const profileResponse = await fetch(`${config.SUPABASE_URL}/rest/v1/perfis?id=eq.${encodeURIComponent(userId)}&select=role,marca_id`, {
      method: 'GET',
      headers: {
        'apikey': config.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    });

    if (!profileResponse.ok) throw new Error('Erro ao buscar perfil de acesso.');
    const profiles = await profileResponse.json();
    const profile = profiles[0];
    currentProfile = profile;

    if (!profile) {
      brandContainer.style.display = 'none';
      loadListsDropdown(null);
      return;
    }

    if (profile.role === 'admin') {
      brandContainer.style.display = 'block';
      // Busca todas as marcas
      const brandsResponse = await fetch(`${config.SUPABASE_URL}/rest/v1/marcas?select=id,nome&order=nome`, {
        method: 'GET',
        headers: {
          'apikey': config.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (brandsResponse.ok) {
        const brands = await brandsResponse.json();
        if (brands.length === 0) {
          setSelectMessage(brandSelect, 'Sem marcas cadastradas');
          loadListsDropdown(null);
        } else {
          replaceSelectOptions(brandSelect, brands.map(brand => ({ value: brand.id, label: brand.nome })));
          loadListsDropdown(brands[0].id);
        }
      }
    } else {
      brandContainer.style.display = 'none';
      if (profile.marca_id) {
        loadListsDropdown(profile.marca_id);
      } else {
        setSelectMessage(listSelect, 'Nenhuma marca vinculada ao seu perfil');
      }
    }
  } catch (err) {
    console.error('Erro ao inicializar perfil na extensão:', err);
    statusEl.textContent = 'Erro ao verificar permissões do usuário.';
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

// Escuta alteração de marca para carregar silos
if (brandSelect) {
  brandSelect.addEventListener('change', () => {
    loadListsDropdown(brandSelect.value);
  });
}

async function loadListsDropdown(marcaId) {
  if (!listSelect) return;
  if (!marcaId) {
    setSelectMessage(listSelect, 'Selecione uma marca primeiro');
    return;
  }
  setSelectMessage(listSelect, 'Carregando listas...');
  
  try {
    const config = getExtensionConfig();
    const storage = await chrome.storage.local.get(['supabase_session']);
    const token = storage.supabase_session ? storage.supabase_session.access_token : null;
    if (!token) return;

    const supabaseListsUrl = `${config.SUPABASE_URL}/rest/v1/listas_kgr?select=id,nome&marca_id=eq.${encodeURIComponent(marcaId)}&order=nome`;

    const response = await fetch(supabaseListsUrl, {
      method: 'GET',
      headers: {
        'apikey': config.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) throw new Error('Erro ao buscar listas');
    const lists = await response.json();
    
    if (lists.length === 0) {
      setSelectMessage(listSelect, 'Nenhum silo encontrado nesta marca');
    } else {
      replaceSelectOptions(listSelect, lists.map(list => ({ value: list.id, label: list.nome })));
    }
  } catch (err) {
    console.error('Erro ao carregar listas no popup:', err);
    setSelectMessage(listSelect, 'Erro ao carregar listas');
  }
}

function showLoginView() {
  minerView.classList.add('hidden');
  loginView.classList.remove('hidden');
  statusEl.textContent = '';
  resultsEl.classList.add('hidden');
  copyBtn.classList.add('hidden');
  keywordInput.value = '';
  locationInput.value = '';
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
      email: data.user.email
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
  if (!listaId) {
    statusEl.textContent = 'Selecione uma lista de destino.';
    return;
  }

  const brandId = brandContainer.style.display === 'block' ? brandSelect.value : (currentProfile ? currentProfile.marca_id : null);

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
      panelUrl = getExtensionConfig().PANEL_URL;
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

