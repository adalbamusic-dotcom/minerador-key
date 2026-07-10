const {
  loadProjectEnv,
  requireEnv,
  requireRealDbOptIn,
} = require('../_helpers/runtime');

const env = loadProjectEnv();
requireRealDbOptIn(env);
requireEnv(env, [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TEST_AUTH_EMAIL',
  'TEST_AUTH_PASSWORD',
]);

async function createAdminUser() {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: env.TEST_AUTH_EMAIL,
        password: env.TEST_AUTH_PASSWORD,
        email_confirm: true,
      }),
    }
  );

  console.log(`Criacao de usuario finalizada com HTTP ${response.status}.`);
  if (!response.ok) process.exitCode = 1;
}

createAdminUser().catch((error) => {
  console.error('Falha ao criar usuario:', error.message);
  process.exitCode = 1;
});
