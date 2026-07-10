const { loadProjectEnv, requireEnv } = require('../_helpers/runtime');

const env = loadProjectEnv();
requireEnv(env, [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'TEST_AUTH_EMAIL',
  'TEST_AUTH_PASSWORD',
]);

async function testLogin() {
  const response = await fetch(
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

  console.log(`Teste legado de login finalizado com HTTP ${response.status}.`);
  if (!response.ok) process.exitCode = 1;
}

testLogin().catch((error) => {
  console.error('Falha no login legado:', error.message);
  process.exitCode = 1;
});
