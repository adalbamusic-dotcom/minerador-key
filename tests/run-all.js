/*
 * Testes de regressao — PUBLICADO E SAGRADO
 * ------------------------------------------
 * Roda contra o Supabase real (Service Role) e a API local do Next.js.
 *
 * Uso:  npm test
 *       (ou) node tests/run-all.js
 *
 * Pre-requisitos:
 *   - .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 *   - Migration 0001_protect_publicado.sql APLICADA no Supabase (para os testes de trigger)
 *   - `npm run dev` rodando em http://localhost:3000 (para os testes de API 401)
 *
 * Saida: resumo PASS/FAIL/SKIP + codigo de saida (1 se algum FAIL).
 */

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error(`Arquivo .env.local nao encontrado em: ${envPath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    env[key] = value;
  });
  return env;
}

const env = loadEnv();
const SUPA_URL = (env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const API_BASE = (env.TEST_API_BASE || 'http://localhost:3000').replace(/\/$/, '');

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
}

async function supa(method, restPath, body) {
  const opts = {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPA_URL}/rest/v1/${restPath}`, opts);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function api(method, apiPath, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${API_BASE}${apiPath}`, opts);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, data: e.message };
  }
}

// Extrai os cookies "name=value" de uma resposta fetch (Node 18+ undici)
function extractCookies(res) {
  const raw = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  return raw.map(c => c.split(';')[0].trim()).filter(c => c.includes('='));
}

// Faz login via NextAuth (credentials provider) e devolve o cookie de sessao.
// Robusto: nao depende de cookie colado manualmente (que expira).
async function loginViaNextAuth(email, password) {
  // 1. Obtem CSRF token + cookie de csrf
  const csrfRes = await fetch(`${API_BASE}/api/auth/csrf`, { method: 'GET' });
  if (!csrfRes.ok) return null;
  const { csrfToken } = await csrfRes.json();
  const csrfCookies = extractCookies(csrfRes);
  const csrfCookie = csrfCookies.find(c => c.startsWith('next-auth.csrf-token')) || '';

  // 2. POST credentials com o cookie de csrf
  const form = new URLSearchParams({
    csrfToken,
    email,
    password,
    callbackUrl: '/',
    json: 'true',
  });
  const loginRes = await fetch(`${API_BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(csrfCookie ? { Cookie: csrfCookie } : {}),
    },
    body: form.toString(),
    redirect: 'manual',
  });

  // 3. Captura o cookie de sessao
  const loginCookies = extractCookies(loginRes);
  const sessionCookie = loginCookies.find(c => c.startsWith('next-auth.session-token')) || '';
  if (!sessionCookie) return null;
  // envia sessao + csrf juntos
  return [sessionCookie, csrfCookie].filter(Boolean).join('; ');
}

async function serverUp() {
  const r = await api('GET', '/');
  return r.status !== 0;
}

// Probe seguro (somente leitura): a migration adiciona a coluna volume_source.
// Se ela existir, os triggers da mesma migration tambem foram criados.
async function migrationApplied() {
  const r = await supa('GET', 'keywords_kgr?select=volume_source&limit=1');
  return r.status === 200;
}

async function findPublishedKeyword() {
  const r = await supa('GET', 'keywords_kgr?status=eq.publicado&select=id,keyword,lista_id&limit=1');
  return r.data && r.data[0] ? r.data[0] : null;
}

async function findMarcaWithPublished() {
  const pub = await findPublishedKeyword();
  if (!pub || !pub.lista_id) return null;
  const lr = await supa('GET', `listas_kgr?id=eq.${pub.lista_id}&select=marca_id&limit=1`);
  if (lr.data && lr.data[0] && lr.data[0].marca_id) return lr.data[0].marca_id;
  return null;
}

function isProtectedError(r) {
  const blob = JSON.stringify(r.data);
  return r.status >= 400 && blob.includes('PUBLICADO_PROTEGIDO');
}

// ===========================================================================
// TESTES DE TRIGGER (DB) — requerem migration aplicada
// ===========================================================================

async function testDeletePublishedKeyword() {
  const kw = await findPublishedKeyword();
  if (!kw) return record('1. DELETE de keyword publicada bloqueada', 'skip', 'sem keyword publicada no banco');
  const r = await supa('DELETE', `keywords_kgr?id=eq.${kw.id}`);
  record('1. DELETE de keyword publicada bloqueada', isProtectedError(r), `status=${r.status} | ${JSON.stringify(r.data).slice(0, 140)}`);
}

async function testRebaixamentoBlocked() {
  const kw = await findPublishedKeyword();
  if (!kw) return record('2. Rebaixamento de status publicada bloqueado', 'skip', 'sem keyword publicada');
  const r = await supa('PATCH', `keywords_kgr?id=eq.${kw.id}`, { status: 'aprovado' });
  record('2. Rebaixamento de status publicada bloqueado', isProtectedError(r), `status=${r.status} | ${JSON.stringify(r.data).slice(0, 140)}`);
}

async function testMoveSiloBlocked() {
  const kw = await findPublishedKeyword();
  if (!kw) return record('3. Movimentacao de silo de publicada bloqueada', 'skip', 'sem keyword publicada');
  // Tenta mudar lista_id para um uuid inexistente (deve ser bloqueado)
  const r = await supa('PATCH', `keywords_kgr?id=eq.${kw.id}`, { lista_id: '00000000-0000-0000-0000-000000000000' });
  record('3. Movimentacao de silo de publicada bloqueada', isProtectedError(r), `status=${r.status} | ${JSON.stringify(r.data).slice(0, 140)}`);
}

async function testAlterKeywordTextBlocked() {
  const kw = await findPublishedKeyword();
  if (!kw) return record('4. Alteracao de keyword textual publicada bloqueada', 'skip', 'sem keyword publicada');
  const r = await supa('PATCH', `keywords_kgr?id=eq.${kw.id}`, { keyword: `${kw.keyword} __TESTE_PROTECAO__` });
  record('4. Alteracao de keyword textual publicada bloqueada', isProtectedError(r), `status=${r.status} | ${JSON.stringify(r.data).slice(0, 140)}`);
}

async function testDeleteListaWithPublishedBlocked() {
  const kw = await findPublishedKeyword();
  if (!kw || !kw.lista_id) return record('5. DELETE de lista com publicada bloqueada', 'skip', 'sem lista com publicada');
  const r = await supa('DELETE', `listas_kgr?id=eq.${kw.lista_id}`);
  record('5. DELETE de lista com publicada bloqueada', isProtectedError(r), `status=${r.status} | ${JSON.stringify(r.data).slice(0, 140)}`);
}

async function testDeleteMarcaWithPublishedBlocked() {
  const marcaId = await findMarcaWithPublished();
  if (!marcaId) return record('6. DELETE de marca com publicada bloqueada (DB)', 'skip', 'sem marca com publicada');
  const r = await supa('DELETE', `marcas?id=eq.${marcaId}`);
  record('6. DELETE de marca com publicada bloqueada (DB)', isProtectedError(r), `status=${r.status} | ${JSON.stringify(r.data).slice(0, 140)}`);
}

// ===========================================================================
// TESTES DE API — requerem `npm run dev` rodando
// ===========================================================================

async function expect401(name, apiPath, body) {
  const r = await api('POST', apiPath, body);
  const pass = r.status === 401;
  record(name, pass, `status=${r.status} (esperado 401) | ${JSON.stringify(r.data).slice(0, 120)}`);
}

async function testApi401() {
  await expect401('7. /api/analyze sem sessao retorna 401', '/api/analyze', { keywordId: 'x', keyword: 'x' });
  await expect401('8. /api/process-intent-niche sem sessao retorna 401', '/api/process-intent-niche', { keywordId: 'x', keyword: 'x' });
  await expect401('9. /api/generate-briefing sem sessao retorna 401', '/api/generate-briefing', { keywords: [] });
  await expect401('10. /api/clusterize sem sessao retorna 401', '/api/clusterize', { keywords: [] });
  await expect401('11. /api/revalidate-structure sem sessao retorna 401', '/api/revalidate-structure', { structure: {} });
  await expect401('12. /api/volume sem sessao retorna 401', '/api/volume', { keywords: ['x'] });
}

async function testDeleteMarcaApi409() {
  const marcaId = await findMarcaWithPublished();
  if (!marcaId) {
    return record('13. DELETE /api/marcas com publicada retorna 409', 'skip', 'sem marca com publicada');
  }

  // --- Obtencao de cookie de sessao admin ---
  // Prioridade: 1) login automatico via NextAuth (TEST_AUTH_EMAIL + TEST_AUTH_PASSWORD)
  //             2) cookie colado manualmente (TEST_SESSION_COOKIE)
  //             3) skip
  const authEmail = process.env.TEST_AUTH_EMAIL || env.TEST_AUTH_EMAIL || '';
  const authPass = process.env.TEST_AUTH_PASSWORD || env.TEST_AUTH_PASSWORD || '';
  const rawCookie = process.env.TEST_SESSION_COOKIE || env.TEST_SESSION_COOKIE || '';

  let cookieHeader = '';

  if (authEmail && authPass) {
    console.log('Tentando login automatico via NextAuth (TEST_AUTH_EMAIL/TEST_AUTH_PASSWORD)...');
    const loggedIn = await loginViaNextAuth(authEmail, authPass);
    if (loggedIn) {
      cookieHeader = loggedIn;
      console.log('Login automatico OK: cookie de sessao obtido (tamanho=' + cookieHeader.length + ')');
    } else {
      console.log('Login automatico FALHOU (credenciais invalidas ou erro no NextAuth)');
    }
  }

  // Fallback: cookie colado manualmente
  if (!cookieHeader && rawCookie.trim().length > 0) {
    console.log('TEST_SESSION_COOKIE presente (fallback manual): tamanho=' + rawCookie.trim().length);
    cookieHeader = rawCookie.trim().replace(/^Cookie:\s*/i, '');
    if (!cookieHeader.includes('=')) {
      cookieHeader = `next-auth.session-token=${cookieHeader}`;
    }
  }

  if (!cookieHeader) {
    return record(
      '13. DELETE /api/marcas com publicada retorna 409',
      'skip',
      'defina TEST_AUTH_EMAIL + TEST_AUTH_PASSWORD (recomendado) ou TEST_SESSION_COOKIE em .env.local'
    );
  }

  try {
    const res = await fetch(`${API_BASE}/api/marcas?id=${marcaId}`, {
      method: 'DELETE',
      headers: {
        Cookie: cookieHeader,
      },
    });
    const text = await res.text();
    let detail = '';
    try {
      const data = JSON.parse(text);
      detail = JSON.stringify(data).slice(0, 140);
    } catch {
      detail = text.slice(0, 140);
    }

    // Log imediato (nao espera o resumo) pra facilitar o diagnostico
    console.log(`[13-DEBUG] status recebido: ${res.status} | body: ${detail}`);

    // Diagnostico por status para facilitar o entendimento da falha
    let hint = '';
    if (res.status === 401) hint = ' | HINT: sessao nao reconhecida (credenciais invalidas/expiradas)';
    else if (res.status === 403) hint = ' | HINT: sessao valida mas usuario nao e admin';
    else if (res.status === 409) hint = ' | OK: marca com publicado bloqueada';
    else if (res.status === 200) hint = ' | HINT: delete prosseguiu (trigger do banco deveria ter bloqueado)';
    else hint = ` | HINT: status inesperado`;

    record(
      '13. DELETE /api/marcas com publicada retorna 409',
      res.status === 409,
      `status=${res.status} (esperado 409) | ${detail}${hint}`
    );
  } catch (e) {
    record(
      '13. DELETE /api/marcas com publicada retorna 409',
      false,
      `erro no fetch: ${e.message}`
    );
  }
}

// ===========================================================================
// ORQUESTRADOR
// ===========================================================================

async function main() {
  const realDbTestsEnabled =
    process.env.ALLOW_REAL_DB_TESTS === 'true' ||
    env.ALLOW_REAL_DB_TESTS === 'true';

  if (!realDbTestsEnabled) {
    console.log('[SKIP] Testes contra o Supabase real nao foram executados.');
    console.log('       Para habilitar conscientemente, defina ALLOW_REAL_DB_TESTS=true.');
    console.log('       Esta suite envia PATCH e DELETE ao banco configurado.');
    return;
  }

  console.log('=== Testes de regressao: PUBLICADO E SAGRADO ===\n');
  console.log(`Supabase: ${SUPA_URL ? 'OK' : 'FALTANDO'}`);
  console.log(`Service key: ${SERVICE_KEY ? 'OK' : 'FALTANDO'}`);
  console.log(`API base: ${API_BASE}\n`);

  // --- DB trigger tests ---
  const migrated = await migrationApplied();
  if (!migrated) {
    console.log('!! Migration 0001_protect_publicado.sql NAO aplicada.');
    console.log('   Os testes de trigger (1-6) serao SKIPADOS.');
    console.log('   Aplique a migration no SQL Editor do Supabase e rode novamente.\n');
    for (let i = 1; i <= 6; i++) {
      record(`${i}. (trigger)`, 'skip', 'migration nao aplicada');
    }
  } else {
    console.log('Migration aplicada (coluna volume_source presente). Rodando testes de trigger...\n');
    await testDeletePublishedKeyword();
    await testRebaixamentoBlocked();
    await testMoveSiloBlocked();
    await testAlterKeywordTextBlocked();
    await testDeleteListaWithPublishedBlocked();
    await testDeleteMarcaWithPublishedBlocked();
  }

  // --- API tests ---
  const up = await serverUp();
  if (!up) {
    console.log(`\n!! Servidor Next.js nao responde em ${API_BASE}.`);
    console.log('   Os testes de API (7-13) serao SKIPADOS. Rode `npm run dev` em outro terminal.\n');
    for (let i = 7; i <= 13; i++) {
      record(`${i}. (api 401/409)`, 'skip', 'servidor nao responde');
    }
  } else {
    console.log('\nServidor Next.js respondendo. Rodando testes de API...\n');
    await testApi401();
    await testDeleteMarcaApi409();
  }

  // --- Resumo ---
  console.log('\n=== RESUMO ===');
  let pass = 0, fail = 0, skip = 0;
  for (const r of results) {
    const tag = r.pass === true ? 'PASS' : r.pass === 'skip' ? 'SKIP' : 'FAIL';
    console.log(`[${tag}] ${r.name}`);
    if (r.detail) console.log(`        -> ${r.detail}`);
    if (r.pass === true) pass++;
    else if (r.pass === 'skip') skip++;
    else fail++;
  }
  console.log(`\nTotal: ${results.length} | PASS: ${pass} | FAIL: ${fail} | SKIP: ${skip}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Erro fatal no runner de testes:', e);
  process.exit(1);
});
