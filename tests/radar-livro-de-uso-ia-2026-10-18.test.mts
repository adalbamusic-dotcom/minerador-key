import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { RadarArticleBlueprintAiSchema, buildRadarArticleBlueprintBrief } from "../lib/radar/article-blueprint.ts";
import {
  fecharArtigoModelo,
  radarArticleBlueprintUsageRecorder,
  requestRadarArticleBlueprintAi,
} from "../lib/server/radar-article-blueprint.ts";
import {
  recordIntegrationUsageForResource,
  type IntegrationResolvedResource,
  type IntegrationRuntimeDependencies,
  type IntegrationUsageEvent,
  type RecordIntegrationUsageInput,
} from "../lib/server/integrations-runtime.ts";
import { StructuredAIError } from "../lib/server/structured-ai.ts";
import { ARTIGO, entradaGoogle, planoDoSilo } from "./radar-portable-writing-fixtures.mts";

/*
 * ===== 2026-10-18 · A IA DO RADAR ENTRA NO LIVRO DE USO =====
 *
 * Teste real local (WifiConecta, 17–18/10): "Pesquisar e finalizar (7 artigos)"
 * e várias organizações do artigo-modelo pagaram a IA da plataforma
 * (OpenRouter, cota da marca) e `integration_usage_events` não ganhou nenhuma
 * linha do Radar — só as do Arquiteto. A cota da marca não via essas chamadas.
 *
 * Prova-se aqui, com `fetch` FALSO e o gravador REAL do livro
 * (`recordIntegrationUsageForResource`) sobre um repositório falso:
 *
 *   1. cada chamada que sai vira UM evento: a primeira, a nova tentativa e a
 *      passada de correção; chamada não pedida não registra nada;
 *   2. o evento é o das rotas de IA do Arquiteto: `module_operation`, módulo
 *      `radar`, 1 unidade, a resource da Connection resolvida, chave
 *      `<provider>:<operação>:<pedido>:<chamada>[:failed]`, única por chamada;
 *   3. falha do provider registra `failed` e o erro que sobe é o do provider;
 *      o livro falhando num sucesso derruba a operação (sucesso só com o livro);
 *   4. a geração liga o gravador depois da cota e passa o MESMO registro às
 *      duas etapas; a rota das pautas do especialista grava do mesmo jeito.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ================================ fixtures ================================ */

const MARCA = "bbbbbbbb-0000-4000-8000-000000000018";
const ATOR = "cccccccc-0000-4000-8000-000000000018";
const PEDIDO = "dddddddd-0000-4000-8000-000000000018";

const RESOURCE = {
  allowed: true, actorUserId: ATOR, agencyId: null, brandId: MARCA, resourceKey: null,
  capability: { id: "cap-ai-generation", capability_key: "ai_generation", operation_kind: "ai_generation", environment: "production", unit_name: "request" },
  entitlement: {}, binding: null,
  connection: { connectionId: "conn-openrouter", providerId: "prov-openrouter", providerKey: "openrouter" },
  quota: {},
} as unknown as IntegrationResolvedResource;

const PROVEDOR = {
  provider: "openrouter" as const,
  resource: RESOURCE,
  apiKey: "fixture-sem-valor",
  apiUrl: "https://openrouter.ai/api/v1/chat/completions" as const,
  model: "anthropic/claude-haiku-5.5",
  extraHeaders: {},
  thinkingMode: "provider_default" as const,
};

const brief = () => buildRadarArticleBlueprintBrief({ entrada: entradaGoogle(), silo: planoDoSilo().files[0].writing!, articleId: ARTIGO, publication: null });

/* A mesma planta do teste da chamada de IA: a conferência acha o que corrigir (a passada de correção é pedida). */
function respostaValida() {
  const b = brief();
  const origem = b.skeleton.length ? b.skeleton.map(item => item.id) : [b.evidence[0].id];
  const secao = (h2: string, indice: number) => ({ h2, readerQuestion: `${h2}?`, answerFirst: "Resposta direta.", from: [origem[indice % origem.length]] });
  return {
    keywordPlan: { reading: "A principal no H1." },
    reader: "Leitor.", promise: "Promessa.", angle: { statement: "Ângulo." },
    title: { h1: "Skincare facial: a rotina que funciona", seoTitle: "Skincare facial", metaDescription: "Meta." },
    opening: { readerQuestion: "Como montar uma rotina de skincare facial?", direction: "Responder." },
    sections: ["Limpeza", "Hidratação", "Proteção solar"].map(secao),
    closing: { turn: "Virada.", cta: "CTA." },
    visual: [{ slot: "CAPA", prompt: "pia" }, { slot: "R1", prompt: "espuma" }, { slot: "R2", prompt: "frasco" }],
  };
}

const envelope = (content: string, finishReason = "stop", status = 200) =>
  new Response(JSON.stringify({ choices: [{ finish_reason: finishReason, message: { content } }], usage: { completion_tokens: 900 } }), { status, headers: { "content-type": "application/json" } });

const valida = () => envelope(JSON.stringify(respostaValida()));
const cortada = () => envelope(JSON.stringify(respostaValida()).slice(0, 160), "length");

function provedorFalso(respostas: Array<() => Response>) {
  const pedidos: unknown[] = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    pedidos.push(JSON.parse(String(init?.body)));
    const proxima = respostas.shift();
    if (!proxima) throw new Error("chamada a mais do que o teste previu");
    return proxima();
  }) as typeof fetch;
  return { pedidos, fetchImpl };
}

/** O livro de uso de verdade (`recordIntegrationUsageForResource`) sobre um repositório falso. */
function livroFalso(opcoes: { falhaNaGravacao?: boolean } = {}) {
  const linhas: IntegrationUsageEvent[] = [];
  const deps = {
    repository: {
      async insertUsage(linha: Omit<IntegrationUsageEvent, "id" | "created_at">) {
        if (opcoes.falhaNaGravacao) throw new Error("LIVRO FORA DO AR");
        if (linhas.some(item => item.connection_id === linha.connection_id && item.idempotency_key === linha.idempotency_key)) throw Object.assign(new Error("duplicate"), { code: "23505" });
        const gravada = { ...linha, id: `uso-${linhas.length + 1}`, created_at: "2026-10-18T12:00:00+00:00" } as IntegrationUsageEvent;
        linhas.push(gravada);
        return gravada;
      },
      async findUsageByIdempotency(connectionId: string, chave: string) {
        return linhas.find(item => item.connection_id === connectionId && item.idempotency_key === chave) ?? null;
      },
    },
    authorizationRepository: {},
  } as unknown as IntegrationRuntimeDependencies;
  const record = (evento: RecordIntegrationUsageInput) => recordIntegrationUsageForResource(evento, deps);
  return { linhas, recordCall: radarArticleBlueprintUsageRecorder({ provider: PROVEDOR, articleId: ARTIGO, operationRequestId: PEDIDO, record }) };
}

async function semAvisos<T>(trabalho: () => Promise<T>): Promise<{ valor: T | null; erro: unknown }> {
  const original = console.warn;
  console.warn = () => {};
  try {
    return { valor: await trabalho(), erro: null };
  } catch (erro) {
    return { valor: null, erro };
  } finally {
    console.warn = original;
  }
}

/** Como a geração compõe as duas etapas (`generateRadarArticleBlueprint`), com o MESMO registro. */
async function organizar(fetchImpl: typeof fetch, recordCall: ReturnType<typeof livroFalso>["recordCall"]) {
  const b = brief();
  const resposta = await requestRadarArticleBlueprintAi({ provider: PROVEDOR, brief: b, articleId: ARTIGO, fetchImpl, recordCall });
  return fecharArtigoModelo({ provider: PROVEDOR, brief: b, ai: resposta.ai, articleId: ARTIGO, allowFix: resposta.calls === 1, fetchImpl, recordCall });
}

const resumo = (linhas: IntegrationUsageEvent[]) => linhas.map(linha => `${linha.metadata.call}:${linha.result_status}`);

/* ============================== 1 · um evento por chamada ============================== */

test("1 · primeira resposta inteira + passada de correção: 2 chamadas, 2 eventos — o do Arquiteto, módulo radar", async () => {
  const { pedidos, fetchImpl } = provedorFalso([valida, valida]);
  const { linhas, recordCall } = livroFalso();
  const { erro } = await semAvisos(() => organizar(fetchImpl, recordCall));
  assert.equal(erro, null);
  assert.equal(pedidos.length, 2, "a conferência pediu a correção");
  assert.deepEqual(resumo(linhas), ["first:succeeded", "correction:succeeded"]);
  for (const linha of linhas) {
    assert.equal(linha.operation_kind, "module_operation");
    assert.equal(linha.module, "radar");
    assert.equal(linha.units, 1);
    assert.equal(linha.unit_name, "request");
    assert.equal(linha.brand_id, MARCA, "a cota é da marca");
    assert.equal(linha.actor_user_id, ATOR);
    assert.equal(linha.connection_id, "conn-openrouter");
    assert.equal(linha.capability_id, "cap-ai-generation");
    assert.equal(linha.error_code, null);
    assert.equal(linha.metadata.operationRequestId, PEDIDO);
    assert.equal(linha.metadata.operationKind, "radar_article_blueprint");
    assert.equal(linha.metadata.articleId, ARTIGO);
  }
  assert.deepEqual(linhas.map(linha => linha.idempotency_key), [
    `openrouter:radar_article_blueprint:${PEDIDO}:first`,
    `openrouter:radar_article_blueprint:${PEDIDO}:correction`,
  ]);
});

test("1 · resposta cortada: a nova tentativa conta — 2 chamadas, 2 eventos, e a correção é pulada (nada a registrar)", async () => {
  const { pedidos, fetchImpl } = provedorFalso([cortada, valida]);
  const { linhas, recordCall } = livroFalso();
  const { erro } = await semAvisos(() => organizar(fetchImpl, recordCall));
  assert.equal(erro, null);
  assert.equal(pedidos.length, 2);
  assert.deepEqual(resumo(linhas), ["first:failed", "retry:succeeded"]);
  const [primeira] = linhas;
  assert.equal(primeira.idempotency_key, `openrouter:radar_article_blueprint:${PEDIDO}:first:failed`);
  assert.equal(primeira.error_code, "RADAR_ARTICLE_BLUEPRINT_FAILED");
  assert.equal(primeira.metadata.failureCode, "AI_OUTPUT_INVALID");
});

test("1 · cortada duas vezes: 2 eventos de falha e o erro claro do provider sobe como antes", async () => {
  const { pedidos, fetchImpl } = provedorFalso([cortada, cortada]);
  const { linhas, recordCall } = livroFalso();
  const { erro } = await semAvisos(() => organizar(fetchImpl, recordCall));
  assert.equal(pedidos.length, 2);
  assert.ok(erro instanceof StructuredAIError);
  assert.match((erro as Error).message, /^A resposta da IA veio cortada/);
  assert.deepEqual(resumo(linhas), ["first:failed", "retry:failed"]);
});

test("1 · falha que não se repete (credencial): 1 chamada, 1 evento de falha", async () => {
  const { pedidos, fetchImpl } = provedorFalso([() => new Response("{}", { status: 401 })]);
  const { linhas, recordCall } = livroFalso();
  const { erro } = await semAvisos(() => organizar(fetchImpl, recordCall));
  assert.equal(pedidos.length, 1);
  assert.ok(erro instanceof StructuredAIError);
  assert.deepEqual(resumo(linhas), ["first:failed"]);
});

test("1 · a passada de correção falhando: grava-se a primeira, e a correção conta como chamada que falhou", async () => {
  const { pedidos, fetchImpl } = provedorFalso([valida, () => new Response("{}", { status: 500 })]);
  const { linhas, recordCall } = livroFalso();
  const { valor, erro } = await semAvisos(() => organizar(fetchImpl, recordCall));
  assert.equal(erro, null, "a correção falhando não derruba nada");
  assert.ok(valor!.payload);
  assert.equal(pedidos.length, 2);
  assert.deepEqual(resumo(linhas), ["first:succeeded", "correction:failed"]);
  assert.equal(linhas[1].idempotency_key, `openrouter:radar_article_blueprint:${PEDIDO}:correction:failed`);
});

test("1 · chamada não pedida não registra: sem tempo no prazo, nem nova tentativa nem correção", async () => {
  const semPrazo = provedorFalso([cortada]);
  const livro = livroFalso();
  await semAvisos(() => requestRadarArticleBlueprintAi({ provider: PROVEDOR, brief: brief(), fetchImpl: semPrazo.fetchImpl, deadlineAt: Date.now() + 10_000, recordCall: livro.recordCall }));
  assert.equal(semPrazo.pedidos.length, 1);
  assert.deepEqual(resumo(livro.linhas), ["first:failed"]);

  const semCorrecao = provedorFalso([]);
  const outro = livroFalso();
  const { erro } = await semAvisos(() => fecharArtigoModelo({ provider: PROVEDOR, brief: brief(), ai: RadarArticleBlueprintAiSchema.parse(respostaValida()), articleId: ARTIGO, fetchImpl: semCorrecao.fetchImpl, deadlineAt: Date.now() + 10_000, recordCall: outro.recordCall }));
  assert.equal(erro, null);
  assert.equal(semCorrecao.pedidos.length, 0);
  assert.equal(outro.linhas.length, 0, "a correção não foi pedida: nada no livro");
});

/* ============================== 3 · o livro e o erro ============================== */

test("3 · o livro fora do ar: num sucesso, a operação falha (sem sucesso fora do livro); numa falha, o erro do provider é o que sobe", async () => {
  const sucesso = provedorFalso([valida]);
  const livro = livroFalso({ falhaNaGravacao: true });
  const { erro } = await semAvisos(() => requestRadarArticleBlueprintAi({ provider: PROVEDOR, brief: brief(), fetchImpl: sucesso.fetchImpl, recordCall: livro.recordCall }));
  assert.match(String((erro as Error)?.message), /LIVRO FORA DO AR/);
  assert.equal(sucesso.pedidos.length, 1, "o livro falhando não vira nova tentativa paga");

  const falha = provedorFalso([() => new Response("{}", { status: 401 })]);
  const outro = livroFalso({ falhaNaGravacao: true });
  const resultado = await semAvisos(() => requestRadarArticleBlueprintAi({ provider: PROVEDOR, brief: brief(), fetchImpl: falha.fetchImpl, recordCall: outro.recordCall }));
  assert.ok(resultado.erro instanceof StructuredAIError, "o erro do provider, não o do livro");

  const correcao = provedorFalso([valida]);
  const terceiro = livroFalso({ falhaNaGravacao: true });
  const fechar = await semAvisos(() => fecharArtigoModelo({ provider: PROVEDOR, brief: brief(), ai: RadarArticleBlueprintAiSchema.parse(respostaValida()), articleId: ARTIGO, fetchImpl: correcao.fetchImpl, recordCall: terceiro.recordCall }));
  assert.match(String((fechar.erro as Error)?.message), /LIVRO FORA DO AR/, "a correção paga sem livro não se passa por 'correção falhou'");
});

test("3 · o mesmo evento gravado duas vezes é idempotente (a chave é a do pedido e da chamada)", async () => {
  const { linhas, recordCall } = livroFalso();
  await recordCall({ kind: "first", ok: true });
  await recordCall({ kind: "first", ok: true });
  assert.equal(linhas.length, 1);
});

/* ============================== 4 · a ligação na geração e nas pautas ============================== */

const ler = (caminho: string) => readFile(new URL(`../${caminho}`, import.meta.url), "utf8").then(texto => texto.replace(/\r\n/g, "\n"));
const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"])\/\/[^\n]*/g, "$1 ");

test("4 · a geração liga o gravador real depois da cota e passa o MESMO registro às duas etapas", async () => {
  const servidor = semComentarios(await ler("lib/server/radar-article-blueprint.ts"));
  assert.match(servidor, /import \{ recordIntegrationUsage, type RecordIntegrationUsageInput \} from "@\/lib\/server\/integrations-runtime";/);
  const corpo = servidor.slice(servidor.indexOf("export async function generateRadarArticleBlueprint"), servidor.indexOf("export async function fecharArtigoModelo"));
  const cota = corpo.indexOf("resolveDeepSeekCanonicalConfig({ actorUserId: input.actorUserId, brandId: input.brandId, client: input.client, quotaUnits: 1 })");
  const liga = corpo.indexOf("radarArticleBlueprintUsageRecorder({ provider, articleId: input.articleId, operationRequestId: crypto.randomUUID(), record: recordIntegrationUsage })");
  const pede = corpo.indexOf("requestRadarArticleBlueprintAi({ provider, brief, articleId: input.articleId, deadlineAt: prazo, recordCall })");
  const fecha = corpo.indexOf("fecharArtigoModelo({ provider, brief, ai: resposta.ai, articleId: input.articleId, allowFix: resposta.calls === 1, deadlineAt: prazo, recordCall })");
  assert.ok(cota > 0 && cota < liga && liga < pede && pede < fecha, "a cota de antes continua; o registro nasce antes da primeira chamada e serve às duas");
  assert.equal((corpo.match(/generateStructuredAI\(/g) || []).length, 0, "a geração não chama a IA por fora das duas etapas");
  /* As duas únicas chamadas à IA do arquivo passam pelo registro. */
  assert.equal((servidor.match(/generateStructuredAI\(\{/g) || []).length, 2);
  assert.match(servidor, /await input\.recordCall\?\.\(\{ kind: curta \? "retry" : "first", ok: resultado\.ok/);
  assert.match(servidor, /await input\.recordCall\?\.\(\{ kind: "correction", ok: correcao\.ok/);
});

test("4 · as pautas do especialista: a mesma cota de antes e um evento por chamada, módulo radar", async () => {
  const rota = semComentarios(await ler("app/api/editorial/radar-topics/route.ts"));
  assert.match(rota, /import \{ recordIntegrationUsage \} from "@\/lib\/server\/integrations-runtime";/);
  const cota = rota.indexOf("resolveDeepSeekCanonicalConfig({ actorUserId: context.actorUserId, brandId: context.brandId, client: context.supabase, quotaUnits: 1 })");
  const chamada = rota.indexOf("generateStructuredAI(");
  assert.ok(cota > 0 && cota < chamada);
  assert.match(rota, /resource: provider\.resource, operation: "module_operation" as const, module: "radar", units: 1, metadata: \{ operationRequestId, operationKind: "radar_expert_topics", articleId: pedido\.articleId \}/);
  assert.match(rota, /resultStatus: "failed", errorCode: "RADAR_EXPERT_TOPICS_FAILED", idempotencyKey: `\$\{provider\.provider\}:radar_expert_topics:\$\{operationRequestId\}:failed` \}\)\.catch\(\(\) => undefined\);\n\s+throw error;/);
  assert.match(rota, /await recordIntegrationUsage\(\{ \.\.\.uso, resultStatus: "succeeded", idempotencyKey: `\$\{provider\.provider\}:radar_expert_topics:\$\{operationRequestId\}` \}\);/);
  assert.ok(rota.indexOf('resultStatus: "succeeded"') < rota.indexOf("return NextResponse.json({ success: true"), "sucesso só depois do livro");
  assert.equal((rota.match(/generateStructuredAI\(/g) || []).length, 1);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, [], "nenhuma ida à rede: todo provider é falso");
});
