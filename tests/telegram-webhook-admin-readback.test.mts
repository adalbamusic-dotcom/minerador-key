import assert from "node:assert/strict";
import test from "node:test";
import { readPlatformIntegrations } from "../lib/server/platform-integrations-admin.ts";

/**
 * QUAL DAS DUAS LEITURAS DO TELEGRAM VALE — e a resposta é: a mais recente.
 *
 * O DEFEITO EM PRODUÇÃO: "Configurar Webhook" confirmou a URL às 11:03:52, e o
 * card continuou dizendo "Não configurado" porque um "Testar Webhook" de
 * 11:03:39 — treze segundos ANTES, com `url` vazia — tinha precedência fixa na
 * projeção. As duas fontes são respostas do provedor; preferir uma delas sem
 * olhar a hora erra metade das vezes.
 *
 * Este arquivo exercita a projeção com metadata montado à mão: nenhuma chamada
 * de rede, nenhum banco real.
 */

const URL_CANONICA = "https://minerador-key.vercel.app/api/integrations/telegram/webhook";
const providerId = "80000000-0000-4000-8000-0000000000a1";
const connectionId = "80000000-0000-4000-8000-0000000000a2";

/** O cliente mínimo que `readPlatformIntegrations` consulta. */
function clienteFalso(metadata: Record<string, unknown>) {
  /*
   * ENCADEÁVEL E "THENABLE", como o builder do supabase-js.
   *
   * O código real encadeia em ordens que o teste não controla — `.order().limit()`,
   * `.eq().order()` — e só espera no fim. Um duplo que resolve num método
   * específico quebra assim que alguém reordena a query; este resolve no `await`.
   */
  const tabela = (data: unknown) => {
    const alvo: Record<string, unknown> = {
      select: () => alvo, eq: () => alvo, neq: () => alvo, in: () => alvo, limit: () => alvo, order: () => alvo,
      maybeSingle: async () => ({ data: Array.isArray(data) ? data[0] || null : data, error: null }),
      single: async () => ({ data: Array.isArray(data) ? data[0] || null : data, error: null }),
      then: (resolver: (valor: { data: unknown; error: null }) => unknown) => Promise.resolve(resolver({ data, error: null })),
    };
    return alvo;
  };

  return {
    from(nome: string) {
      if (nome === "integration_providers") return tabela([{ id: providerId, provider_key: "telegram", display_name: "Telegram Bot", status: "active" }]);
      if (nome === "integration_connections") {
        return tabela([{ id: connectionId, provider_id: providerId, owner_scope_type: "platform", environment: "production", lifecycle_status: "ready", secret_ref: "80000000-0000-4000-8000-0000000000a3", metadata }]);
      }
      return tabela([]);
    },
  };
}

async function projetar(telegram: Record<string, unknown>, healthCheck: Record<string, unknown> | null) {
  const metadata: Record<string, unknown> = { label: "Telegram Bot", telegram };
  if (healthCheck) metadata.health_check = healthCheck;
  const snapshot = await readPlatformIntegrations(clienteFalso(metadata) as never);
  const conexao = snapshot.platformConnections.find(item => item.providerKey === "telegram");
  assert.ok(conexao, "a connection Telegram existe na projeção");
  return conexao;
}

const consultaVazia = (checkedAt: string) => ({
  status: "ready", checked_at: checkedAt,
  details: { stage: "get_webhook_info", webhookUrl: "", webhookConfigured: "false", pendingUpdateCount: "3", lastError: "" },
});

const consultaComUrl = (checkedAt: string, url = URL_CANONICA) => ({
  status: "ready", checked_at: checkedAt,
  details: { stage: "get_webhook_info", webhookUrl: url, webhookConfigured: "true", pendingUpdateCount: "0", lastError: "" },
});

const confirmado = (configuredAt: string, url = URL_CANONICA) => ({
  bot_username: "minekeybot",
  webhook_url: url,
  webhook_target_url: url,
  webhook_configured_at: configuredAt,
});

/* ===================== o caso exato da produção ====================== */

test("ADMIN_READBACK · a confirmação mais nova vence o teste mais velho", async () => {
  /* Os carimbos reais do incidente: consulta 11:03:39, confirmação 11:03:52. */
  const conexao = await projetar(confirmado("2026-09-13T11:03:52.246Z"), consultaVazia("2026-09-13T11:03:39.051Z"));

  assert.equal(conexao.telegramWebhookConfigured, true, "o webhook estava instalado havia treze segundos");
  assert.equal(conexao.telegramWebhookUrl, URL_CANONICA);
  assert.equal(conexao.telegramBotUsername, "minekeybot");
});

test("ADMIN_READBACK · o teste mais novo vence a confirmação mais velha", async () => {
  /*
   * O CAMINHO CONTRÁRIO IMPORTA IGUAL.
   *
   * Se alguém removeu o webhook por fora, o `getWebhookInfo` seguinte é a
   * verdade — e a confirmação de ontem vira memória. Preferir sempre o local
   * faria a tela afirmar um webhook que não existe mais.
   */
  const conexao = await projetar(confirmado("2026-09-13T10:00:00.000Z"), consultaVazia("2026-09-13T12:00:00.000Z"));

  assert.equal(conexao.telegramWebhookConfigured, false);
  assert.equal(conexao.telegramWebhookUrl, null);
  /* E a pretendida sobrevive, para a tela saber o que oferecer configurar. */
  assert.equal(conexao.telegramWebhookTargetUrl, URL_CANONICA);
});

test("ADMIN_READBACK · uma consulta que ENCONTROU webhook também configura", async () => {
  /* Webhook posto por fora, descoberto pelo "Testar Webhook": é configurado. */
  const conexao = await projetar({ bot_username: "minekeybot" }, consultaComUrl("2026-09-13T12:00:00.000Z"));

  assert.equal(conexao.telegramWebhookConfigured, true);
  assert.equal(conexao.telegramWebhookUrl, URL_CANONICA);
});

/* ========================= os casos de borda ======================== */

test("ADMIN_READBACK · sem consulta nenhuma, a confirmação responde sozinha", async () => {
  const conexao = await projetar(confirmado("2026-09-13T11:03:52.246Z"), null);
  assert.equal(conexao.telegramWebhookConfigured, true);
  assert.equal(conexao.telegramWebhookUrl, URL_CANONICA);
});

test("ADMIN_READBACK · sem confirmação nenhuma, a consulta responde sozinha", async () => {
  const conexao = await projetar({ bot_username: "minekeybot" }, consultaVazia("2026-09-13T11:03:39.051Z"));
  assert.equal(conexao.telegramWebhookConfigured, false);
});

test("ADMIN_READBACK · health check de OUTRA operação não decide nada", async () => {
  /*
   * `getMe` não sabe do webhook. Tratá-lo como consulta faria "Testar Bot"
   * apagar o estado do webhook — o mesmo tipo de erro que apagava o @username.
   */
  const conexao = await projetar(confirmado("2026-09-13T11:03:52.246Z"), {
    status: "ready", checked_at: "2026-09-13T23:00:00.000Z",
    details: { stage: "get_me", botId: "8908390277", botUsername: "minekeybot", botName: "MineKey" },
  });

  assert.equal(conexao.telegramWebhookConfigured, true, "um getMe posterior não desconfigura o webhook");
  assert.equal(conexao.telegramWebhookUrl, URL_CANONICA);
});

test("ADMIN_READBACK · a URL pretendida nunca é prova de configuração", async () => {
  /* Salvar o formulário grava `webhook_target_url`; isso não instala nada. */
  const conexao = await projetar({ bot_username: "minekeybot", webhook_target_url: URL_CANONICA }, null);

  assert.equal(conexao.telegramWebhookConfigured, false);
  assert.equal(conexao.telegramWebhookUrl, null);
  assert.equal(conexao.telegramWebhookTargetUrl, URL_CANONICA);
});

test("ADMIN_READBACK · confirmação sem carimbo de hora não conta como configurada", async () => {
  /* Foi exatamente esse o estado deixado pelo save antigo, antes da separação. */
  const conexao = await projetar({ bot_username: "minekeybot", webhook_url: URL_CANONICA, webhook_configured_at: null }, null);
  assert.equal(conexao.telegramWebhookConfigured, false);
});

test("ADMIN_READBACK · data inválida não vira vitória por acidente", async () => {
  const conexao = await projetar(confirmado("data-quebrada"), consultaVazia("2026-09-13T11:03:39.051Z"));
  assert.equal(conexao.telegramWebhookConfigured, false, "sem hora confiável, a consulta com carimbo decide");
});

test("ADMIN_READBACK · com hora ilegível dos dois lados, a consulta que viu o webhook vale", async () => {
  /*
   * O CASO EM QUE `null` E `0` DIVERGEM — e por isso `instante` devolve `null`.
   *
   * A confirmação tem uma data que não parseia; a consulta não tem carimbo
   * nenhum. Ninguém pode ganhar por hora, e o que sobra é o fato: o Telegram
   * respondeu que há webhook naquele endereço.
   *
   * Com `0` no lugar de `null`, a confirmação passaria a ter hora "zero", a
   * comparação a derrubaria, e o código cairia num `Boolean(confirmada && 0)` —
   * declarando inexistente um webhook que o provedor acabou de confirmar.
   * Provado por mutação.
   */
  const conexao = await projetar(
    { bot_username: "minekeybot", webhook_url: URL_CANONICA, webhook_target_url: URL_CANONICA, webhook_configured_at: "data-quebrada" },
    { status: "ready", details: { stage: "get_webhook_info", webhookUrl: URL_CANONICA, webhookConfigured: "true", pendingUpdateCount: "0", lastError: "" } },
  );

  assert.equal(conexao.telegramWebhookConfigured, true, "a consulta encontrou o webhook e ninguém tem hora para disputar");
  assert.equal(conexao.telegramWebhookUrl, URL_CANONICA);
});

test("ADMIN_READBACK · a projeção não depende de estado de tela", async () => {
  /* Duas leituras do mesmo metadata devolvem o mesmo veredito. */
  const primeira = await projetar(confirmado("2026-09-13T11:03:52.246Z"), consultaVazia("2026-09-13T11:03:39.051Z"));
  const segunda = await projetar(confirmado("2026-09-13T11:03:52.246Z"), consultaVazia("2026-09-13T11:03:39.051Z"));

  assert.equal(primeira.telegramWebhookConfigured, segunda.telegramWebhookConfigured);
  assert.equal(primeira.telegramWebhookUrl, segunda.telegramWebhookUrl);
  assert.equal(primeira.telegramBotUsername, segunda.telegramBotUsername);
});
