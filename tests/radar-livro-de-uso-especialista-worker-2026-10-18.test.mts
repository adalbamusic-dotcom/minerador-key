import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRadarExpertContributionWorkerProcessor, radarExpertOrganizationUsageRecorder } from "../lib/server/local-worker/radar-expert-contribution.ts";
import type { ExternalProcessingJob } from "../lib/server/local-worker/runner.ts";
import type { DeepSeekCanonicalResolution } from "../lib/server/deepseek-canonical.ts";
import {
  createIntegrationRuntimeRepository,
  recordIntegrationUsageForResource,
  type IntegrationResolvedResource,
  type IntegrationRuntimeDependencies,
  type IntegrationUsageEvent,
} from "../lib/server/integrations-runtime.ts";
import { StructuredAIError } from "../lib/server/structured-ai.ts";

/*
 * ===== 2026-10-18 · A ORGANIZAÇÃO DO ESPECIALISTA (WORKER LOCAL) ENTRA NO LIVRO DE USO =====
 *
 * Teste real local (WifiConecta, 17–18/10): as chamadas pagas de IA do Radar
 * não apareciam em `integration_usage_events`. O artigo-modelo e as pautas do
 * especialista passaram a gravar; faltava a organização da contribuição do
 * especialista, que roda no worker local (`organize_expert_transcript`), fora
 * da sessão — então não pode usar `recordIntegrationUsage`.
 *
 * Prova-se aqui, com `fetch` FALSO e o gravador REAL do livro
 * (`recordIntegrationUsageForResource` sobre o repositório montado do PRÓPRIO
 * cliente do worker, que aqui é falso):
 *
 *   1. cada chamada ao provider vira UM evento: sucesso e falha; o evento é o
 *      do Radar (`module_operation`, módulo `radar`, 1 unidade, a resource da
 *      Connection resolvida), chave `<provider>:radar_expert_organization:<job>:<tentativa>[:failed]`;
 *   2. a nova tentativa do job é outra chamada paga e ganha outro evento;
 *      regravar a mesma tentativa é idempotente;
 *   3. falha do provider registra `failed` e o erro que sobe é o do provider;
 *      o livro falhando num sucesso derruba o job (sem writeback sem livro);
 *   4. a organização injetada (`organize`) e a já presente não chamam provider
 *      e não gravam nada.
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

const MARCA = "bbbbbbbb-0000-4000-8000-000000001018";
const ATOR = "cccccccc-0000-4000-8000-000000001018";
const JOB = "dddddddd-0000-4000-8000-000000001018";
const CONTRIBUICAO = "eeeeeeee-0000-4000-8000-000000001018";
const PAUTA = "ffffffff-0000-4000-8000-000000001018";
const ESPECIALISTA = "aaaaaaaa-0000-4000-8000-000000001018";
const ARTIGO = "art-especialista-1018";

const TRANSCRICAO = "Na prática, começo pela avaliação do sinal e registro uma ressalva sobre o roteador antigo.";

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
  apiUrl: "https://openrouter.ai/api/v1/chat/completions",
  model: "anthropic/claude-haiku-5.5",
  extraHeaders: {},
  thinkingMode: "provider_default" as const,
} as unknown as DeepSeekCanonicalResolution;

const LINHA_CONTRIBUICAO = {
  id: CONTRIBUICAO, brand_id: MARCA, expert_id: ESPECIALISTA, brief_id: PAUTA, provider: "telegram", source_type: "VOICE",
  original_text: null, transcript_text: TRANSCRICAO, organization_payload: null, external_update_id: "upd-1018",
  original_asset_uri: "gs://fixture/audio.ogg", original_checksum: null, processing_status: "EXTRACTED", received_at: "2026-10-18T10:00:00+00:00",
};

const LINHA_PAUTA = {
  id: PAUTA, brand_id: MARCA, expert_id: ESPECIALISTA, article_id: ARTIGO, article_dna_version_id: "dna-v1", title: "Wi-Fi que cai à noite",
  radar_context: {}, questions: [{ text: "Como você começa o diagnóstico?" }], status: "awaiting_review",
  created_at: "2026-10-18T09:00:00+00:00", updated_at: "2026-10-18T09:00:00+00:00", sent_at: null, completed_at: null,
};

const ORGANIZACAO = {
  organizedText: "Começa pela avaliação do sinal; ressalva sobre roteador antigo.",
  points: ["Avaliar o sinal primeiro"],
  classifications: ["processo", "ressalva"],
  relatedQuestion: "Como você começa o diagnóstico?",
  literalQuotes: ["registro uma ressalva"],
};

const job = (attempts = 1) => ({
  id: JOB, brand_id: MARCA, brief_id: PAUTA, contribution_id: CONTRIBUICAO, job_kind: "document_extraction", status: "PROCESSING",
  attempts, max_attempts: 3, payload: { operation: "organize_expert_transcript" }, claimed_by: "worker-1018",
}) as ExternalProcessingJob;

type Linha = Record<string, unknown>;

/** O cliente do worker, falso: contribuição, pauta e a tabela do livro de uso. Nenhuma ida ao banco. */
function clienteDoWorker(opcoes: { livroFora?: boolean; organizada?: boolean } = {}) {
  const livro: IntegrationUsageEvent[] = [];
  const tabelas: string[] = [];
  const contribuicao: Linha = { ...LINHA_CONTRIBUICAO, organization_payload: opcoes.organizada ? { organizedText: "já organizada" } : null };
  const from = (tabela: string) => {
    tabelas.push(tabela);
    const filtros = new Map<string, unknown>();
    let inserida: Linha | null = null;
    let atualizando = false;
    const consulta = {
      select: () => consulta,
      in: () => consulta,
      is: () => consulta,
      order: () => consulta,
      eq: (coluna: string, valor: unknown) => { filtros.set(coluna, valor); return consulta; },
      update: () => { atualizando = true; return consulta; },
      insert: (linha: Linha) => { inserida = linha; return consulta; },
      async single() {
        if (tabela !== "integration_usage_events" || !inserida) throw new Error(`single inesperado em ${tabela}`);
        if (opcoes.livroFora) return { data: null, error: { code: "PGRST000", message: "LIVRO FORA DO AR" } };
        const nova: Linha = inserida;
        if (livro.some(item => item.connection_id === nova.connection_id && item.idempotency_key === nova.idempotency_key)) return { data: null, error: { code: "23505", message: "duplicate" } };
        const gravada = { ...nova, id: `uso-${livro.length + 1}`, created_at: "2026-10-18T12:00:00+00:00" } as unknown as IntegrationUsageEvent;
        livro.push(gravada);
        return { data: gravada, error: null };
      },
      async maybeSingle() {
        if (tabela === "integration_usage_events") return { data: livro.find(item => item.connection_id === filtros.get("connection_id") && item.idempotency_key === filtros.get("idempotency_key")) ?? null, error: null };
        if (tabela === "expert_contributions") return { data: atualizando ? { id: CONTRIBUICAO, processing_status: "PROCESSING" } : contribuicao, error: null };
        if (tabela === "expert_briefs") return { data: LINHA_PAUTA, error: null };
        throw new Error(`tabela inesperada: ${tabela}`);
      },
    };
    return consulta;
  };
  const rpc = () => { throw new Error("rpc inesperado"); };
  return { client: { from, rpc } as never, livro, tabelas };
}

const envelope = (content: string, status = 200) =>
  new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content } }], usage: { completion_tokens: 300 } }), { status, headers: { "content-type": "application/json" } });

const valida = () => envelope(JSON.stringify(ORGANIZACAO));
const semCredencial = () => new Response("{}", { status: 401 });
const foraDoContrato = () => envelope(JSON.stringify({ organizedText: "texto", inventado: true }));

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

function worker(cliente: ReturnType<typeof clienteDoWorker>, fetchImpl: typeof fetch) {
  return createRadarExpertContributionWorkerProcessor({ actorUserId: ATOR, client: cliente.client, resolveAi: async () => PROVEDOR, fetchImpl });
}

async function semAvisos<T>(trabalho: () => Promise<T>): Promise<{ valor: T | null; erro: unknown }> {
  const original = console.error;
  console.error = () => {};
  try {
    return { valor: await trabalho(), erro: null };
  } catch (erro) {
    return { valor: null, erro };
  } finally {
    console.error = original;
  }
}

const resumo = (livro: IntegrationUsageEvent[]) => livro.map(linha => `${linha.idempotency_key}=${linha.result_status}`);

/* ============================== 1 · um evento por chamada ============================== */

test("1 · sucesso: 1 chamada, 1 evento do Radar gravado pelo cliente do worker — e o writeback sai como antes", async () => {
  const cliente = clienteDoWorker();
  const { pedidos, fetchImpl } = provedorFalso([valida]);
  const { valor, erro } = await semAvisos(() => worker(cliente, fetchImpl)(job(1)));
  assert.equal(erro, null);
  assert.equal(pedidos.length, 1);
  assert.equal(valor!.status, "COMPLETED");
  assert.equal(valor!.writeback?.kind, "expert_contribution_organization");
  assert.equal(valor!.payload?.provider, "openrouter");
  assert.ok(cliente.tabelas.includes("integration_usage_events"), "o livro é gravado pelo cliente do worker, fora da sessão");
  assert.deepEqual(resumo(cliente.livro), [`openrouter:radar_expert_organization:${JOB}:1=succeeded`]);
  const [linha] = cliente.livro;
  assert.equal(linha.operation_kind, "module_operation");
  assert.equal(linha.module, "radar");
  assert.equal(linha.units, 1);
  assert.equal(linha.unit_name, "request");
  assert.equal(linha.brand_id, MARCA, "a cota é da marca");
  assert.equal(linha.actor_user_id, ATOR);
  assert.equal(linha.connection_id, "conn-openrouter");
  assert.equal(linha.capability_id, "cap-ai-generation");
  assert.equal(linha.error_code, null);
  assert.deepEqual(linha.metadata, {
    operationRequestId: JOB, operationKind: "radar_expert_organization", attempt: 1,
    contributionId: CONTRIBUICAO, briefId: PAUTA, articleId: ARTIGO,
  });
});

test("1 · falha do provider (credencial): 1 chamada, 1 evento failed, e o erro que sobe é o do provider", async () => {
  const cliente = clienteDoWorker();
  const { pedidos, fetchImpl } = provedorFalso([semCredencial]);
  const { erro } = await semAvisos(() => worker(cliente, fetchImpl)(job(1)));
  assert.equal(pedidos.length, 1);
  assert.ok(erro instanceof StructuredAIError, "o erro original do provider");
  assert.deepEqual(resumo(cliente.livro), [`openrouter:radar_expert_organization:${JOB}:1:failed=failed`]);
  const [linha] = cliente.livro;
  assert.equal(linha.error_code, "RADAR_EXPERT_ORGANIZATION_FAILED");
  assert.equal(linha.metadata.failureCode, (erro as StructuredAIError).code);
});

test("1 · resposta fora do contrato: a chamada saiu e falhou — 1 evento failed com o código do contrato", async () => {
  const cliente = clienteDoWorker();
  const { pedidos, fetchImpl } = provedorFalso([foraDoContrato]);
  const { erro } = await semAvisos(() => worker(cliente, fetchImpl)(job(1)));
  assert.equal(pedidos.length, 1);
  assert.ok(erro instanceof StructuredAIError);
  assert.deepEqual(resumo(cliente.livro), [`openrouter:radar_expert_organization:${JOB}:1:failed=failed`]);
  assert.equal(cliente.livro[0].metadata.failureCode, "AI_OUTPUT_INVALID");
});

/* ============================== 2 · tentativas do job ============================== */

test("2 · a nova tentativa do job é outra chamada paga: outro evento (a falha da 1ª não engole a 2ª)", async () => {
  const cliente = clienteDoWorker();
  const primeira = provedorFalso([semCredencial]);
  await semAvisos(() => worker(cliente, primeira.fetchImpl)(job(1)));
  const segunda = provedorFalso([semCredencial]);
  await semAvisos(() => worker(cliente, segunda.fetchImpl)(job(2)));
  const terceira = provedorFalso([valida]);
  const { erro } = await semAvisos(() => worker(cliente, terceira.fetchImpl)(job(3)));
  assert.equal(erro, null);
  assert.deepEqual(resumo(cliente.livro), [
    `openrouter:radar_expert_organization:${JOB}:1:failed=failed`,
    `openrouter:radar_expert_organization:${JOB}:2:failed=failed`,
    `openrouter:radar_expert_organization:${JOB}:3=succeeded`,
  ]);
});

test("2 · regravar o evento da mesma tentativa é idempotente (a chave é a do job e da tentativa)", async () => {
  const cliente = clienteDoWorker();
  const deps = { repository: createIntegrationRuntimeRepository(cliente.client), authorizationRepository: {} } as unknown as IntegrationRuntimeDependencies;
  const recordCall = radarExpertOrganizationUsageRecorder({ provider: PROVEDOR, job: { id: JOB, attempts: 1 }, contributionId: CONTRIBUICAO, briefId: PAUTA, articleId: ARTIGO, record: evento => recordIntegrationUsageForResource(evento, deps) });
  await recordCall({ ok: true });
  await recordCall({ ok: true });
  assert.equal(cliente.livro.length, 1);
});

/* ============================== 3 · o livro e o erro ============================== */

test("3 · o livro fora do ar: no sucesso o job falha (sem writeback sem livro); na falha, o erro do provider é o que sobe", async () => {
  const sucesso = provedorFalso([valida]);
  const fora = clienteDoWorker({ livroFora: true });
  const { valor, erro } = await semAvisos(() => worker(fora, sucesso.fetchImpl)(job(1)));
  assert.equal(valor, null, "sem livro, o job não devolve writeback");
  assert.equal((erro as { message?: string })?.message, "LIVRO FORA DO AR");
  assert.equal(sucesso.pedidos.length, 1, "o livro falhando não vira nova chamada paga dentro do job");

  const falha = provedorFalso([semCredencial]);
  const outro = clienteDoWorker({ livroFora: true });
  const resultado = await semAvisos(() => worker(outro, falha.fetchImpl)(job(1)));
  assert.ok(resultado.erro instanceof StructuredAIError, "o erro do provider, não o do livro");
});

/* ============================== 4 · sem chamada, sem evento ============================== */

test("4 · a organização injetada (organize) não resolve a IA, não chama provider e não grava evento", async () => {
  const cliente = clienteDoWorker();
  const processor = createRadarExpertContributionWorkerProcessor({
    actorUserId: ATOR, client: cliente.client,
    organize: async () => ({ ...ORGANIZACAO }),
    resolveAi: async () => { throw new Error("não devia resolver a IA"); },
    fetchImpl: (async () => { throw new Error("não devia chamar o provider"); }) as typeof fetch,
  });
  const resultado = await processor(job(1));
  assert.equal(resultado.status, "COMPLETED");
  assert.equal(resultado.payload?.provider, "injected");
  assert.equal(cliente.livro.length, 0);
  assert.ok(!cliente.tabelas.includes("integration_usage_events"));
});

test("4 · organização já presente: idempotente, nada pago e nada no livro", async () => {
  const cliente = clienteDoWorker({ organizada: true });
  const { pedidos, fetchImpl } = provedorFalso([]);
  const resultado = await worker(cliente, fetchImpl)(job(1));
  assert.equal(resultado.payload?.organizationAlreadyPresent, true);
  assert.equal(pedidos.length, 0);
  assert.equal(cliente.livro.length, 0);
});

/* ============================== a ligação no worker ============================== */

const ler = (caminho: string) => readFile(new URL(`../${caminho}`, import.meta.url), "utf8").then(texto => texto.replace(/\r\n/g, "\n"));
const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"])\/\/[^\n]*/g, "$1 ");

test("o worker grava pelo próprio cliente (fora da sessão), com a única chamada à IA passando pelo registro", async () => {
  const fonte = semComentarios(await ler("lib/server/local-worker/radar-expert-contribution.ts"));
  assert.doesNotMatch(fonte, /\brecordIntegrationUsage\(/, "o gravador da sessão não serve ao worker");
  assert.match(fonte, /repository: createIntegrationRuntimeRepository\(workerClient\), authorizationRepository: createCanonicalAuthorizationRepository\(workerClient\)/);
  assert.match(fonte, /record: event => recordIntegrationUsageForResource\(event, usageDependencies\)/);
  assert.equal((fonte.match(/generateStructuredAI\(/g) || []).length, 1, "uma única chamada à IA no worker");
  assert.match(fonte, /catch \(error\) \{\n\s+await recordCall\(\{ ok: false, error \}\);\n\s+throw error;\n\s+\}\n\s+await recordCall\(\{ ok: true \}\);\n\s+return validateRadarExpertOrganization/);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, [], "nenhuma ida à rede: todo provider é falso");
});
