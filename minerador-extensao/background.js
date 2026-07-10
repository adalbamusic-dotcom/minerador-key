try {
  importScripts('config.local.js');
} catch {
  console.error('Configuração local da extensão não foi carregada.');
}

const extensionConfig = globalThis.MINERADOR_CONFIG || {};

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
    executeMining(request.keyword, request.locations, request.listaId, request.marcaId)
      .then(results => {
        sendResponse({ results });
      })
      .catch(err => {
        sendResponse({ error: err.message || 'Erro durante a extração.' });
      });
    return true; // Mantém a porta de comunicação aberta para tarefas assíncronas
  }
});

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
      const queryUrl = `${config.SUPABASE_URL}/rest/v1/keywords_kgr?select=keyword&lista_id=eq.${encodeURIComponent(listaId)}`;
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
        if (marcaId) {
          item.marca_id = marcaId;
        }
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

