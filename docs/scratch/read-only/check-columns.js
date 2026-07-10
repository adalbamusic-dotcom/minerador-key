const { loadProjectEnv } = require('../_helpers/runtime');

const env = loadProjectEnv();

async function checkSchema() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  try {
    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        'apikey': anonKey
      }
    });
    const schema = await response.json();
    const tableInfo = schema.paths['/keywords_kgr'];
    if (tableInfo) {
      console.log('Parâmetros suportados para GET /keywords_kgr:');
      const getParams = tableInfo.get.parameters;
      const columns = getParams.filter(p => p.in === 'query').map(p => p.name);
      console.log(columns);
    } else {
      console.log('Tabela /keywords_kgr não encontrada no schema.');
    }
  } catch (err) {
    console.error('Erro ao buscar schema:', err);
  }
}

checkSchema();
