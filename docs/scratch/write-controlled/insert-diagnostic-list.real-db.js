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

async function insertDiagnosticList() {
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

  const response = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/listas_kgr`,
    {
      method: 'POST',
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nome: 'Lista Teste Diagnostico', nicho: 'SEO' }),
    }
  );

  console.log(`Insercao diagnostica finalizada com HTTP ${response.status}.`);
  if (!response.ok) process.exitCode = 1;
}

insertDiagnosticList().catch((error) => {
  console.error('Falha no diagnostico:', error.message);
  process.exitCode = 1;
});
