const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..', '..');

function loadProjectEnv() {
  const envPath = path.join(projectRoot, '.env.local');
  const fileEnv = {};

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const separator = trimmed.indexOf('=');
      if (separator < 1) return;
      fileEnv[trimmed.slice(0, separator).trim()] = trimmed
        .slice(separator + 1)
        .trim();
    });
  }

  return { ...fileEnv, ...process.env };
}

function requireRealDbOptIn(env) {
  if (env.ALLOW_REAL_DB_TESTS === 'true') return;

  console.log('[SKIP] Script com escrita no Supabase real bloqueado.');
  console.log('       Defina ALLOW_REAL_DB_TESTS=true para executar conscientemente.');
  process.exit(0);
}

function requireEnv(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Variaveis obrigatorias ausentes: ${missing.join(', ')}`);
  }
}

module.exports = {
  loadProjectEnv,
  requireEnv,
  requireRealDbOptIn,
};
