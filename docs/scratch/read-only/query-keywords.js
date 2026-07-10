const { loadProjectEnv } = require('../_helpers/runtime');

const env = loadProjectEnv();

async function queryKeywords() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  // Buscar keywords
  const keywordsUrl = `${url}/rest/v1/keywords_kgr?limit=10`;
  console.log(`Buscando keywords de: ${keywordsUrl}`);
  try {
    const response = await fetch(keywordsUrl, {
      method: 'GET',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    
    console.log(`Status HTTP: ${response.status} ${response.statusText}`);
    const data = await response.json();
    console.log('Total registros retornados (amostra de 10):', data.length);
    if (data.length > 0) {
      console.log('Primeiro registro:', JSON.stringify(data[0], null, 2));
      console.log('Todos os status encontrados nesta amostra:', [...new Set(data.map(d => d.status))]);
      console.log('Todas as listas (lista_id) encontradas nesta amostra:', [...new Set(data.map(d => d.lista_id))]);
    } else {
      console.log('A tabela keywords_kgr está completamente vazia no Supabase!');
    }
  } catch (err) {
    console.error('Erro ao buscar:', err);
  }
}

queryKeywords();
