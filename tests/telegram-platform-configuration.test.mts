import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

/**
 * DOIS DEFEITOS INDEPENDENTES, achados no runtime da Vercel.
 *
 * A. "Testar Bot" respondia READY e o Radar dizia que o @username não estava
 *    confirmado. Causa: o username era gravado em `health_check.details`, campo
 *    único que guarda o ÚLTIMO health check de QUALQUER operação — "Testar
 *    Webhook" o apagava ao escrever `get_webhook_info` por cima.
 *
 * B. `setWebhook` gravava sucesso a partir do HTTP 200, sem reler. O Telegram
 *    aceitar o pedido não é o webhook estar instalado.
 */

const admin = await readFile(new URL("../lib/server/platform-integrations-admin.ts", import.meta.url), "utf8");
const telegramAdmin = await readFile(new URL("../lib/server/telegram/admin.ts", import.meta.url), "utf8");
const canonical = await readFile(new URL("../lib/server/telegram/canonical.ts", import.meta.url), "utf8");
const painel = await readFile(new URL("../modules/admin/platform-integrations-panel.tsx", import.meta.url), "utf8");
const health = await readFile(new URL("../lib/server/platform-integrations-health.ts", import.meta.url), "utf8");

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "");

/* ========================= A · o bot username ======================== */

test("TELEGRAM_CONFIG · o @username é gravado em chave própria, fora do health check", () => {
  const fonte = semComentarios(admin);

  /* Só o `getMe` traz `botUsername`; as outras operações preservam o que há. */
  assert.match(fonte, /providerKey === "telegram"/);
  assert.match(fonte, /bot_username: username/);
  assert.match(fonte, /\.\.\.\(username \? \{ bot_username/, "sem username, nada é sobrescrito");
  /* O valor é normalizado: o Telegram devolve sem @, a tela mostra com. */
  assert.match(fonte, /detalhes\.botUsername === "string" \? detalhes\.botUsername\.trim\(\)\.replace/);
});

test("TELEGRAM_CONFIG · quem lê o username prefere a chave durável", () => {
  for (const [nome, fonte] of [["canonical", canonical], ["admin", admin]] as const) {
    const limpo = semComentarios(fonte);
    assert.match(limpo, /telegram\.bot_username/, `${nome} lê a chave durável`);
    /* O fallback do health check existe para connections gravadas antes disso. */
    assert.match(limpo, /details\.botUsername|detalhes\.botUsername/, `${nome} mantém o fallback legado`);
  }
  /*
   * A ORDEM IMPORTA: o durável primeiro.
   *
   * Invertida, a leitura voltaria a preferir `health_check.details` — o campo
   * que a próxima consulta sobrescreve — e o defeito estaria de volta inteiro.
   */
  const limpo = semComentarios(canonical);
  assert.ok(limpo.indexOf("telegram.bot_username") < limpo.indexOf("details.botUsername"), "o durável é consultado antes do legado");
});

test("TELEGRAM_CONFIG · nenhum username é hardcodado", () => {
  for (const [nome, fonte] of [["admin", admin], ["canonical", canonical], ["painel", painel], ["health", health]] as const) {
    assert.ok(!/minekeybot/i.test(fonte), `${nome} não hardcoda o bot`);
  }
});

test("TELEGRAM_CONFIG · o Admin expõe o username como fato próprio", () => {
  assert.match(semComentarios(admin), /telegramBotUsername: string \| null/);
  assert.match(semComentarios(admin), /telegramBotUsername: telegramBotUsername\(row\.metadata\)/);
  assert.match(semComentarios(painel), /Bot username: \$\{username \? `@\$\{username\}` : "Não confirmado — use Testar Bot\."\}/);
});

/* ====================== B · o readback do webhook ==================== */

test("TELEGRAM_CONFIG · setWebhook só vira sucesso depois do getWebhookInfo confirmar", () => {
  const fonte = semComentarios(telegramAdmin);

  const escreve = fonte.indexOf("bot.setWebhook(");
  const rele = fonte.indexOf("bot.getWebhookInfo()");
  assert.ok(escreve > 0 && rele > escreve, "o readback acontece DEPOIS do setWebhook");

  /* HTTP 200 não é confirmação: a URL precisa bater. */
  assert.match(fonte, /if \(remoteUrl !== normalizedUrl\)/);
  assert.match(fonte, /WEBHOOK_READBACK_MISMATCH/);
  assert.match(fonte, /continua sem webhook configurado/);

  /* E a gravação usa a URL REMOTA, não a que o formulário pediu. */
  assert.match(fonte, /webhook_url: remoteUrl/);
  assert.ok(!/webhook_url: normalizedUrl/.test(fonte), "a URL pedida não vira estado confirmado");

  const falha = fonte.indexOf("WEBHOOK_READBACK_MISMATCH");
  const grava = fonte.indexOf("webhook_url: remoteUrl");
  assert.ok(falha < grava, "a recusa acontece antes de persistir qualquer coisa");
});

test("TELEGRAM_CONFIG · salvar o formulário não afirma que o webhook existe", () => {
  const fonte = semComentarios(admin);

  /* Duas URLs, dois significados: pretendida e confirmada. */
  assert.match(fonte, /webhook_target_url: text\(input\.telegramWebhookUrl/);
  assert.ok(!/webhook_url: text\(input\.telegramWebhookUrl/.test(fonte), "salvar não escreve a URL confirmada");
  assert.match(fonte, /telegramWebhookTargetUrl: alvo \|\| webhookUrl/);
  /* E a pretendida nunca conta como configurado. */
  assert.ok(!/telegramWebhookConfigured: Boolean\(alvo\)/.test(fonte));
});

test("TELEGRAM_CONFIG · testar e configurar continuam sendo ações distintas", () => {
  /* TESTAR = getWebhookInfo, read-only. Nunca chama setWebhook. */
  const saude = semComentarios(health);
  assert.match(saude, /bot\.getWebhookInfo\(\)/);
  assert.ok(!saude.includes("setWebhook"), "testar não configura");

  /* CONFIGURAR = ação nomeada, com URL pública obrigatória. */
  assert.match(semComentarios(painel), /action: "configure_telegram_webhook"/);
  assert.match(semComentarios(telegramAdmin), /WEBHOOK_URL_INVALID/);

  /* E os três botões existem separados na tela. */
  for (const rotulo of ["Testar Bot", "Testar Webhook", "Configurar Webhook"]) {
    assert.ok(painel.includes(rotulo), `o botão existe: ${rotulo}`);
  }
});

/* ======================= o segredo e as env vars ===================== */

test("TELEGRAM_CONFIG · o segredo vem do Secret Store, não de process.env", async () => {
  const secretStore = await readFile(new URL("../lib/server/integration-secret-store.ts", import.meta.url), "utf8");

  /* A resolução é por RPC no Postgres, com o `secret_ref` da Connection. */
  assert.match(secretStore, /integration_secret_resolve/);
  assert.match(canonical, /secret_ref/);

  /* Nenhum token de bot lido de variável de ambiente em nenhum ponto do caminho. */
  for (const [nome, fonte] of [["canonical", canonical], ["telegramAdmin", telegramAdmin], ["health", health]] as const) {
    assert.ok(!/process\.env\.TELEGRAM/i.test(fonte), `${nome} não lê token do ambiente`);
  }
});

test("TELEGRAM_CONFIG · as env vars do caminho Telegram são só as do Supabase", async () => {
  const fontes = await Promise.all([
    readFile(new URL("../lib/server/canonical-authorization.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server/integration-secret-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server/integrations-runtime.ts", import.meta.url), "utf8"),
  ]);

  const usadas = new Set<string>();
  for (const fonte of fontes) {
    for (const achado of fonte.matchAll(/process\.env\.([A-Z0-9_]+)/g)) usadas.add(achado[1]);
    /* `resolveIntegrationEnvironment` lê pelo parâmetro, não por `process.env.X`. */
    if (/environment\.INTEGRATION_ENVIRONMENT/.test(fonte)) usadas.add("INTEGRATION_ENVIRONMENT");
  }

  assert.deepEqual([...usadas].sort(), ["INTEGRATION_ENVIRONMENT", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
});

test("TELEGRAM_CONFIG · nenhum segredo é impresso ou devolvido ao cliente", () => {
  for (const [nome, fonte] of [["admin", admin], ["telegramAdmin", telegramAdmin], ["canonical", canonical]] as const) {
    assert.ok(!/console\.log/.test(fonte), `${nome} não imprime nada`);
  }
  /* O cliente nunca vê o token nem o segredo do webhook. */
  assert.ok(!/TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET/.test(painel), "a tela não conhece os segredos");
  assert.match(painel, /O token fica somente no Secret Store/);
});
