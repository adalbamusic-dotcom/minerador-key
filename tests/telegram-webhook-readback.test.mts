import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

/**
 * O ESTADO DO WEBHOOK É DO TELEGRAM, NÃO DA NOSSA MEMÓRIA.
 *
 * O defeito de runtime: "Testar Webhook" respondia "webhook validada, a
 * Connection está READY" enquanto a mesma tela dizia "Webhook: Não configurado".
 * As duas frases eram verdadeiras e nenhuma era útil — a primeira falava da
 * CONSULTA ter funcionado, a segunda de um registro local que só
 * `configure_telegram_webhook` escreve.
 *
 * A auditoria fechou o caso: `getWebhookInfo.url = ""`. Não havia webhook
 * nenhum; havia uma mensagem que parecia dizer que havia.
 */

const admin = await readFile(new URL("../lib/server/platform-integrations-admin.ts", import.meta.url), "utf8");
const painel = await readFile(new URL("../modules/admin/platform-integrations-panel.tsx", import.meta.url), "utf8");
const rota = await readFile(new URL("../app/api/integrations/telegram/webhook/route.ts", import.meta.url), "utf8");
const webhook = await readFile(new URL("../lib/server/telegram/webhook.ts", import.meta.url), "utf8");
const adapter = await readFile(new URL("../lib/server/telegram/adapter.ts", import.meta.url), "utf8");
const canonical = await readFile(new URL("../lib/server/telegram/admin.ts", import.meta.url), "utf8");

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/* ==================== a leitura do estado remoto ===================== */

test("WEBHOOK_READBACK · as duas leituras do Telegram são comparadas pela hora", () => {
  const fonte = semComentarios(admin);

  /*
   * ESTE TESTE PEDIA A REGRA ERRADA.
   *
   * Ele exigia precedência FIXA do `getWebhookInfo` sobre o registro local — e
   * foi exatamente isso que fez o card dizer "Não configurado" com o webhook
   * instalado havia treze segundos: a consulta era mais velha que a confirmação.
   *
   * As duas fontes são respostas do provedor. Quem decide é a mais recente, e o
   * comportamento está exercido em `telegram-webhook-admin-readback.test.mts`.
   */
  assert.match(fonte, /stage === "get_webhook_info"/, "só consulta de webhook decide");
  assert.match(fonte, /detalhes\.webhookUrl/);
  assert.match(fonte, /consultadaEm !== null && consultadaEm > confirmadaEm/, "a hora decide, não a origem");
  /* E a confirmação sem carimbo não conta: sem hora não há como comparar. */
  assert.match(fonte, /Boolean\(confirmada && confirmadaEm\)/);
});

test("WEBHOOK_READBACK · a mensagem do teste não afirma mais que existe webhook", () => {
  const fonte = semComentarios(painel);

  assert.match(fonte, /Estado do webhook consultado no Telegram/);
  /* A frase antiga dizia "validada … READY" para uma consulta com url vazia. */
  assert.ok(!/telegram_webhook" \? " webhook" : ""\} validada/.test(fonte), "a frase ambígua saiu");
  /* E a tela recarrega depois de consultar: é a recarga que fecha a contradição. */
  assert.match(fonte, /if \(!saved \|\| healthOperation === "telegram_webhook"\) await load\(\)/);
});

test("WEBHOOK_READBACK · a URL configurada aparece na tela, não só um rótulo", () => {
  const fonte = semComentarios(painel);
  assert.match(fonte, /Webhook: \{connection\.telegramWebhookConfigured \? connection\.telegramWebhookUrl \|\| "Configurado" : "Não configurado"\}/);
});

/* ======================= a URL canônica sugerida ===================== */

test("WEBHOOK_READBACK · a URL vem da origem da tela, sem domínio hardcodado", () => {
  /*
   * A FONTE CRUA, de propósito.
   *
   * `semComentarios` corta a partir de `//` para remover comentários de linha —
   * e `"https://"` tem `//` dentro de uma string. Medir o texto limpo apagava
   * justamente a linha que este teste existe para provar.
   */
  assert.match(painel, /const TELEGRAM_WEBHOOK_PATH = "\/api\/integrations\/telegram\/webhook"/);
  assert.match(painel, /window\.location\.origin/);
  /* Sugerir localhost enganaria: `setWebhook` recusa o que não for HTTPS. */
  assert.match(painel, /origem\.startsWith\("https:\/\/"\)/);
  /* Nenhum domínio fixo no cliente — preview e produção usam a própria origem. */
  assert.ok(!/minerador-key\.vercel\.app/.test(painel), "o domínio não é hardcodado");
  assert.match(painel, /existingConnection\?\.telegramWebhookUrl \|\| telegramWebhookUrlSugerida\(\)/);
});

test("WEBHOOK_READBACK · o caminho sugerido é o mesmo que a rota serve", async () => {
  /* Um caractere de diferença e o Telegram entrega tudo no lugar errado. */
  const { readdir } = await import("node:fs/promises");
  const existe = await readdir(new URL("../app/api/integrations/telegram/webhook/", import.meta.url));
  assert.ok(existe.includes("route.ts"), "a rota existe no caminho sugerido");
  assert.match(rota, /processTelegramWebhook/);
});

/* ============================ o segredo ============================= */

test("WEBHOOK_READBACK · setWebhook usa o segredo já armazenado, e a rota o exige", () => {
  /* Nenhum segredo novo: `configure_telegram_webhook` reusa o do Secret Store. */
  assert.match(semComentarios(canonical), /setWebhook\(\{ url: normalizedUrl, secretToken: resolution\.secret\.TELEGRAM_WEBHOOK_SECRET \}\)/);
  assert.match(semComentarios(canonical), /resolveTelegramPlatformSecret/);

  /* E a entrada é recusada quando o cabeçalho não confere. */
  assert.match(semComentarios(webhook), /TELEGRAM_WEBHOOK_HEADER/);
  assert.match(semComentarios(webhook), /sameSecret\(resolution\.secret\.TELEGRAM_WEBHOOK_SECRET, receivedSecret\)/);
  assert.match(semComentarios(webhook), /TELEGRAM_WEBHOOK_UNAUTHORIZED/);
  /* Comparação em tempo constante: um `===` vazaria o segredo por timing. */
  assert.match(semComentarios(webhook), /timingSafeEqual/);
});

test("WEBHOOK_READBACK · o cabeçalho conferido é o que o Telegram envia", async () => {
  const contracts = await readFile(new URL("../lib/server/telegram/contracts.ts", import.meta.url), "utf8");
  assert.match(contracts, /TELEGRAM_WEBHOOK_HEADER = "X-Telegram-Bot-Api-Secret-Token"/);
});

/* ==================== o que este gate não fez ====================== */

const health = await readFile(new URL("../lib/server/platform-integrations-health.ts", import.meta.url), "utf8");

test("WEBHOOK_READBACK · consultar não configura, e configurar continua explícito", () => {
  const fonteAdapter = semComentarios(adapter);
  assert.match(fonteAdapter, /getWebhookInfo: \(\) => telegramRequest/);
  assert.match(fonteAdapter, /setWebhook: \(input/);

  /* O health check só CONSULTA — nunca chama setWebhook por conta própria. */
  const saude = semComentarios(health);
  assert.match(saude, /bot\.getWebhookInfo\(\)/);
  assert.ok(!saude.includes("setWebhook"), "testar não configura");

  /* Configurar é uma ação nomeada, com URL pública obrigatória. */
  assert.match(semComentarios(canonical), /WEBHOOK_URL_INVALID/);
  assert.match(semComentarios(painel), /action: "configure_telegram_webhook"/);
});

test("WEBHOOK_READBACK · nenhum token de bot é impresso ou devolvido ao cliente", () => {
  for (const [nome, fonte] of [["admin", admin], ["painel", painel], ["health", semComentarios(adapter)]] as const) {
    assert.ok(!/console\.log\([^)]*BOT_TOKEN/i.test(fonte), `${nome} não imprime token`);
  }
  /* A tela pede o token como password e diz onde ele fica. */
  assert.match(painel, /O token fica somente no Secret Store/);
  assert.ok(!/TELEGRAM_BOT_TOKEN/.test(painel), "o cliente nunca recebe o token");
});
