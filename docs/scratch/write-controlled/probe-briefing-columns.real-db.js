const {
  loadProjectEnv,
  requireEnv,
  requireRealDbOptIn,
} = require('../_helpers/runtime');

const env = loadProjectEnv();
requireRealDbOptIn(env);
requireEnv(env, ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);

async function probeBriefingColumns() {
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY },
  });
  if (!response.ok) throw new Error(`OpenAPI falhou com HTTP ${response.status}`);

  const document = await response.json();
  const definition = document.definitions?.briefings_artigos;
  if (definition) {
    console.log(Object.keys(definition.properties || {}).sort().join('\n'));
    return;
  }

  const probe = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/briefings_artigos`,
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ invalid_column_name_test: 'test' }),
    }
  );
  console.log(`Probe controlado finalizado com HTTP ${probe.status}.`);
}

probeBriefingColumns().catch((error) => {
  console.error('Falha no diagnostico:', error.message);
  process.exitCode = 1;
});
