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
  assert.match(fonte, /telegramWebhookTargetUrl: alvo \|\| confirmada/);
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

/* ============ a ação de configurar, acessível de verdade ============ */

test("TELEGRAM_CONFIG · Configurar Webhook fica na linha de ações, não escondido no formulário", () => {
  /*
   * O DEFEITO DE RUNTIME: o botão só existia dentro do modo de edição, e só se
   * a URL estivesse digitada no formulário. Para configurar o webhook parecia
   * necessário reabrir o cadastro e redigitar o Bot token — que nem é lido de
   * volta do Secret Store. A ação existia e ninguém a alcançava.
   */
  /*
   * O BLOCO DE AÇÕES DO PROVIDER, delimitado pelo próprio JSX.
   *
   * Uma janela de N caracteres a partir de "Testar Bot" media o COMENTÁRIO que
   * cita o rótulo, não o botão. A âncora é a condição que abre o bloco.
   */
  const semComentario = semComentarios(painel);
  const inicio = semComentario.indexOf('definition.key === "telegram" ?');
  const fim = semComentario.indexOf(": renderHealthButton", inicio);
  assert.ok(inicio > 0 && fim > inicio, "o bloco de ações do Telegram existe");
  const acoes = semComentario.slice(inicio, fim);

  for (const rotulo of ["Testar Bot", "Testar Webhook", "Configurar Webhook"]) {
    assert.ok(acoes.includes(rotulo), `${rotulo} está na linha de ações do provider`);
  }

  /* E não depende mais de `editingProvider` nem do campo do formulário. */
  const fonte = semComentarios(painel);
  assert.ok(!/editingProvider === "telegram" && apiForm\.telegramWebhookUrl\.trim\(\) \? <button/.test(fonte), "a condição antiga saiu");
  assert.ok(!/const configureTelegramWebhook = async \(\) => \{\s*if \(editingProvider !== "telegram"\) return;/.test(fonte), "a ação não exige modo de edição");
});

test("TELEGRAM_CONFIG · a URL vem do que está salvo, com a origem como último recurso", () => {
  const fonte = semComentarios(painel);

  assert.match(fonte, /connection\?\.telegramWebhookTargetUrl/);
  assert.match(fonte, /connection\?\.telegramWebhookUrl/);
  assert.match(fonte, /telegramWebhookUrlSugerida\(\)/);
  /* Sem URL nenhuma, a ação recusa em vez de chamar o Telegram com string vazia. */
  assert.match(fonte, /Informe a URL pública HTTPS do webhook antes de configurá-lo/);
});

test("TELEGRAM_CONFIG · o erro real chega à tela, com o código que distingue as causas", () => {
  const fonte = semComentarios(painel);

  /* `result.error` é a mensagem do TelegramWebhookAdminError, não um genérico. */
  assert.match(fonte, /\$\{result\.error \|\| "Não foi possível salvar a integração\."\}/);
  assert.match(fonte, /typeof result\?\.code === "string"/);
  assert.match(fonte, /technicalDetail = \[codigo, databaseCode, databaseConstraint\]/);

  /* E o sucesso só é anunciado com a URL que o Telegram confirmou. */
  assert.match(fonte, /Webhook confirmado pelo Telegram em \$\{url\}/);
});

test("TELEGRAM_CONFIG · a rota devolve mensagem e código do erro do webhook", async () => {
  const rotaAdmin = await readFile(new URL("../app/api/admin/integrations/route.ts", import.meta.url), "utf8");

  /*
   * O BLOCO DO WEBHOOK, RECORTADO.
   *
   * `PlatformIntegrationsAdminError` tem a MESMA linha logo acima, e um
   * `assert.match` no arquivo inteiro encontrava a dele — passando mesmo com a
   * mensagem do webhook trocada por um genérico. Provado por mutação.
   */
  const inicio = rotaAdmin.indexOf("error instanceof TelegramWebhookAdminError");
  assert.ok(inicio > 0, "o tratamento específico existe");
  const bloco = rotaAdmin.slice(inicio, rotaAdmin.indexOf("}", rotaAdmin.indexOf("NextResponse.json", inicio)));
  assert.match(bloco, /error: error\.message, code: error\.code/, "a mensagem real do webhook chega ao cliente");
});
