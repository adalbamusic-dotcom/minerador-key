import assert from "node:assert/strict";
import test from "node:test";
import { configureTelegramPlatformWebhook, TelegramWebhookAdminError } from "../lib/server/telegram/admin.ts";

/**
 * O READBACK, EXERCIDO — não auditado por grep.
 *
 * A pergunta que este arquivo responde é comportamental: o que acontece quando
 * o Telegram responde 200 ao `setWebhook` e, na releitura, continua sem webhook?
 * Um teste de texto não distingue "lê `info.url`" de "assume que deu certo" —
 * provado por mutação, que sobreviveu a toda a auditoria estática.
 *
 * Nenhuma chamada real: o `fetchImpl` é injetado, e o Secret Store é um duplo.
 */

const URL_CANONICA = "https://minerador-key.vercel.app/api/integrations/telegram/webhook";
const connectionId = "60000000-0000-4000-8000-0000000000f1";

/** O mínimo que `resolveTelegramPlatformSecret` consulta, e nada além. */
function clienteFalso(metadata: Record<string, unknown> = {}) {
  const atualizacoes: Array<Record<string, unknown>> = [];
  const encadeado = (data: unknown) => {
    const alvo: Record<string, unknown> = {
      select: () => alvo, eq: () => alvo, neq: () => alvo, is: () => alvo, in: () => alvo, limit: () => alvo,
      order: async () => ({ data, error: null }),
      maybeSingle: async () => ({ data: Array.isArray(data) ? data[0] || null : data, error: null }),
      single: async () => ({ data: Array.isArray(data) ? data[0] || null : data, error: null }),
      then: undefined,
    };
    return alvo;
  };

  return {
    atualizacoes,
    client: {
      from(tabela: string) {
        if (tabela === "integration_providers") return encadeado({ id: "provider-1", provider_key: "telegram", status: "active" });
        if (tabela === "integration_connections") {
          const linhas = [{ id: connectionId, provider_id: "provider-1", secret_ref: "70000000-0000-4000-8000-0000000000f2", metadata, lifecycle_status: "ready", owner_scope_type: "platform", environment: "production" }];
          const alvo = encadeado(linhas) as Record<string, unknown>;
          alvo.update = (valores: Record<string, unknown>) => {
            atualizacoes.push(valores);
            return { eq: async () => ({ data: null, error: null }) };
          };
          return alvo;
        }
        return encadeado(null);
      },
      /*
       * O Secret Store resolve por RPC no Postgres — é por aqui que o segredo
       * chega ao código real. Responder no mesmo caminho exercita a resolução
       * inteira, em vez de injetar um atalho que a produção não usa.
       */
      async rpc(nome: string) {
        if (nome !== "integration_secret_resolve") return { data: null, error: null };
        return { data: JSON.stringify({ TELEGRAM_BOT_TOKEN: "token-de-teste", TELEGRAM_WEBHOOK_SECRET: "segredo-de-teste" }), error: null };
      },
    },
  };
}

/** Um Telegram que aceita o setWebhook e responde o que lhe mandarem no getWebhookInfo. */
function telegramFalso(urlDevolvida: string, extras: Record<string, unknown> = {}) {
  const chamadas: string[] = [];
  const fetchImpl = (async (entrada: unknown, init?: { body?: string }) => {
    const url = String(entrada);
    const metodo = url.split("/").pop() || "";
    chamadas.push(metodo);
    /* O token aparece na URL da Bot API; o teste nunca o imprime. */
    if (metodo === "setWebhook") {
      const corpo = init?.body ? JSON.parse(init.body) as Record<string, unknown> : {};
      chamadas.push(`setWebhook:${corpo.url}`);
      chamadas.push(`secret:${corpo.secret_token ? "presente" : "ausente"}`);
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ ok: true, result: true }) };
    }
    if (metodo === "getWebhookInfo") {
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ ok: true, result: { url: urlDevolvida, has_custom_certificate: false, pending_update_count: 0, ...extras } }) };
    }
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({ ok: true, result: {} }) };
  }) as unknown as typeof fetch;
  return { chamadas, fetchImpl };
}

async function configurar(urlDevolvida: string, extras: Record<string, unknown> = {}) {
  const duplo = clienteFalso();
  const telegram = telegramFalso(urlDevolvida, extras);
  const resultado = await configureTelegramPlatformWebhook({
    client: duplo.client as never,
    connectionId,
    url: URL_CANONICA,
    fetchImpl: telegram.fetchImpl,
  } as never);
  return { resultado, chamadas: telegram.chamadas, atualizacoes: duplo.atualizacoes };
}

test("SETUP · o Telegram confirmando a URL canônica grava exatamente ela", async () => {
  const { resultado, chamadas, atualizacoes } = await configurar(URL_CANONICA);

  assert.equal(resultado.configured, true);
  assert.equal(resultado.url, URL_CANONICA);

  /* A ordem é setWebhook e DEPOIS getWebhookInfo — escrever, então conferir. */
  assert.ok(chamadas.indexOf("setWebhook") < chamadas.indexOf("getWebhookInfo"), `ordem: ${chamadas.join(", ")}`);
  assert.ok(chamadas.includes(`setWebhook:${URL_CANONICA}`));
  /* O segredo já existente viaja no pedido; nenhum novo é criado. */
  assert.ok(chamadas.includes("secret:presente"), "setWebhook envia o secret_token");

  const telegram = (atualizacoes[0]?.metadata as Record<string, unknown>)?.telegram as Record<string, unknown>;
  assert.equal(telegram.webhook_url, URL_CANONICA);
  assert.ok(telegram.webhook_configured_at, "a data da confirmação é gravada");
});

test("SETUP · HTTP 200 com webhook vazio NÃO vira configurado", async () => {
  /*
   * O CASO QUE O GATE ANTERIOR ENCONTROU EM PRODUÇÃO.
   *
   * O Telegram aceita a chamada e continua sem webhook. Declarar sucesso aqui
   * era o que permitia a tela dizer "configurado" com `getWebhookInfo.url` vazio.
   */
  await assert.rejects(
    () => configurar(""),
    (erro: unknown) => {
      assert.ok(erro instanceof TelegramWebhookAdminError);
      assert.equal(erro.code, "WEBHOOK_READBACK_MISMATCH");
      assert.match(erro.message, /continua sem webhook configurado/);
      return true;
    },
  );
});

test("SETUP · o Telegram confirmando OUTRO endereço também falha", async () => {
  const outro = "https://outro-dominio.example/api/integrations/telegram/webhook";
  await assert.rejects(
    () => configurar(outro),
    (erro: unknown) => {
      assert.ok(erro instanceof TelegramWebhookAdminError);
      assert.equal(erro.code, "WEBHOOK_READBACK_MISMATCH");
      /* A mensagem diz QUAL endereço está lá: é o que permite corrigir. */
      assert.ok(erro.message.includes(outro), `mensagem: ${erro.message}`);
      return true;
    },
  );
});

test("SETUP · nada é persistido quando o readback recusa", async () => {
  const duplo = clienteFalso();
  const telegram = telegramFalso("");
  await assert.rejects(() => configureTelegramPlatformWebhook({
    client: duplo.client as never, connectionId, url: URL_CANONICA,
    fetchImpl: telegram.fetchImpl,
  } as never));

  /* Uma verdade que não foi confirmada não pode sobrar gravada no banco. */
  assert.deepEqual(duplo.atualizacoes, []);
});

test("SETUP · o estado do webhook reportado vem do Telegram, não do pedido", async () => {
  const { resultado } = await configurar(URL_CANONICA, { pending_update_count: 7, last_error_message: "Wrong response from the webhook" });

  assert.equal(resultado.pendingUpdateCount, 7);
  assert.equal(resultado.lastErrorMessage, "Wrong response from the webhook");
});

test("SETUP · URL não pública é recusada antes de qualquer chamada ao Telegram", async () => {
  const duplo = clienteFalso();
  const telegram = telegramFalso(URL_CANONICA);

  await assert.rejects(() => configureTelegramPlatformWebhook({
    client: duplo.client as never, connectionId, url: "http://localhost:3000/api/integrations/telegram/webhook",
    fetchImpl: telegram.fetchImpl,
  } as never), (erro: unknown) => {
    assert.ok(erro instanceof TelegramWebhookAdminError);
    assert.equal(erro.code, "WEBHOOK_URL_INVALID");
    return true;
  });

  /* Nenhuma chamada saiu: a recusa acontece antes de tocar no provedor. */
  assert.deepEqual(telegram.chamadas, []);
});
