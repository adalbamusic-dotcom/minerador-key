const { loadProjectEnv } = require('../_helpers/runtime');

const env = loadProjectEnv();

async function testTable() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  try {
    // Tenta fazer um select simples na tabela briefings_artigos
    const response = await fetch(`${url}/rest/v1/briefings_artigos?select=*&limit=1`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    
    if (response.ok) {
      console.log('Tabela briefings_artigos EXISTE no banco de dados!');
      const data = await response.json();
      console.log('Dados amostra:', data);
    } else {
      const errText = await response.text();
      console.log('Tabela briefings_artigos NÃO existe ou deu erro:', errText);
    }
  } catch (err) {
    console.error('Erro de conexão:', err);
  }
}

testTable();
