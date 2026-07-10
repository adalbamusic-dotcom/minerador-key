const {
  loadProjectEnv,
  requireEnv,
  requireRealDbOptIn,
} = require('../_helpers/runtime');

const env = loadProjectEnv();
requireRealDbOptIn(env);
requireEnv(env, [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'TEST_AUTH_EMAIL',
  'TEST_AUTH_PASSWORD',
]);

async function markKeywordPublished() {
  const loginResponse = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: env.TEST_AUTH_EMAIL,
        password: env.TEST_AUTH_PASSWORD,
      }),
    }
  );
  if (!loginResponse.ok) throw new Error(`Login falhou com HTTP ${loginResponse.status}`);

  const { access_token: accessToken } = await loginResponse.json();
  const headers = {
    apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
  };
  const keywordResponse = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/keywords_kgr?select=id&limit=1`,
    { headers }
  );
  if (!keywordResponse.ok) throw new Error(`Leitura falhou com HTTP ${keywordResponse.status}`);

  const [keyword] = await keywordResponse.json();
  if (!keyword) throw new Error('Nenhuma keyword encontrada para o diagnostico.');

  const updateResponse = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/keywords_kgr?id=eq.${keyword.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'publicado' }),
    }
  );

  console.log(`Atualizacao de status finalizada com HTTP ${updateResponse.status}.`);
  if (!updateResponse.ok) process.exitCode = 1;
}

markKeywordPublished().catch((error) => {
  console.error('Falha no diagnostico:', error.message);
  process.exitCode = 1;
});
