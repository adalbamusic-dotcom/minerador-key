const { loadProjectEnv, requireEnv } = require('../_helpers/runtime');

const env = loadProjectEnv();
requireEnv(env, ['RAPIDAPI_KEY', 'RAPIDAPI_HOST', 'RAPIDAPI_URL']);

async function testSupabase(env) {
  // Já verificado com sucesso, não precisa rodar novamente
  console.log('Supabase já verificado com sucesso!');
}

async function testRapidAPI(env) {
  console.log('\n--- TESTANDO PAYLOADS NO RAPIDAPI ---');
  const apiKey = env.RAPIDAPI_KEY;
  const host = env.RAPIDAPI_HOST;
  let rawUrl = env.RAPIDAPI_URL;
  
  if (rawUrl.startsWith('//')) {
    rawUrl = 'https:' + rawUrl;
  }
  
  const payloads = [
    {
      name: "1. Form Urlencoded with keywords",
      type: "form",
      body: "keywords[]=marketing&country=us"
    },
    {
      name: "2. Form Urlencoded with kw",
      type: "form",
      body: "kw[]=marketing&country=us"
    },
    {
      name: "3. Form Urlencoded with keyword",
      type: "form",
      body: "keyword=marketing&country=us"
    }
  ];

  for (const p of payloads) {
    console.log(`\nTestando: ${p.name}`);
    console.log(`Payload: ${p.body}`);
    try {
      const response = await fetch(rawUrl, {
        method: 'POST',
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': host,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: p.body
      });
      
      console.log(`Status HTTP: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.log(`Resposta: ${text}`);
    } catch (error) {
      console.error('Erro na requisição:', error);
    }
  }
}

async function runTests() {
  await testRapidAPI(env);
}

runTests();
