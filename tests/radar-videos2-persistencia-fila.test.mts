import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RADAR_RESET_CLEARED, RADAR_RESET_OUTSIDE_PAYLOAD } from "../lib/radar/radar-reset.ts";
import { createRadarVideoDurableObjectKey, createBrandScopedMediaObjectKey } from "../lib/server/google-cloud/storage-operation.ts";

/*
 * ======  VÍDEOS · GATE 2 — PERSISTÊNCIA, FILA E FRONTEIRAS  ===========
 *
 * O Gate 0 recomendou o modelo híbrido: artefato bruto no Storage durável,
 * texto consultável no PostgreSQL, e a fila existente aprendendo um tipo novo
 * em vez de ganhar uma segunda fila.
 *
 * Estes testes travam as fronteiras que, se cederem, só apareceriam em
 * produção: idempotência, isolamento por marca, append-only do original e o
 * prefixo que separa o que é transitório do que precisa sobreviver.
 *
 * PROVIDER_CALLS = 0 · STORAGE_WRITES = 0 · nada é executado aqui.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const migracao = () => readFileSync(new URL("../supabase/migrations/20260911180000_radar_video_source_texts.sql", import.meta.url), "utf8");
const rotaExtracao = () => readFileSync(new URL("../app/api/editorial/radar-video-text/route.ts", import.meta.url), "utf8");
const processor = () => readFileSync(new URL("../lib/server/local-worker/radar-video-text.ts", import.meta.url), "utf8");
const persistencia = () => readFileSync(new URL("../lib/server/radar-video-text.ts", import.meta.url), "utf8");

/* ==========  B · A AÇÃO DO USER CRIA UM JOB  ====================== */

test("VÍDEOS 2 · B — a ação enfileira e para; quem executa é o worker", () => {
  const rota = rotaExtracao();

  assert.match(rota, /export async function POST/);
  assert.match(rota, /enqueueRadarVideoTextJob\(\{/);

  /*
   * A ROTA NÃO PROCESSA. Chamar Speech ou baixar mídia dentro de um request da
   * Vercel amarraria o processamento ao timeout do HTTP — e é exatamente para
   * isso que o Local Worker existe.
   */
  for (const proibido of ["runSharedLongSpeech", "runSharedShortSpeech", "uploadSharedTemporaryMedia", "googleapis", "ytdl", "yt-dlp"]) {
    assert.ok(!rota.includes(proibido), `a rota não faz "${proibido}"`);
  }

  /* E o job nasce no estado da fila, não em PROCESSING. */
  assert.match(persistencia(), /status: "PENDING_LOCAL_PROCESSING"/);
  assert.match(persistencia(), /state: "QUEUED"/);

  /*
   * A CAPACIDADE É CONFERIDA ANTES DE ENFILEIRAR.
   *
   * Sem esse portão, um vídeo sem caminho de aquisição entraria na fila só
   * para o worker bloqueá-lo uma volta inteira depois — e a fonte ficaria
   * parecendo "na fila" sem nunca sair dela.
   */
  assert.match(rota, /if \(!capacidade\.available\) \{/);
  assert.match(rota, /state: "TEXT_ACQUISITION_UNAVAILABLE", reason: capacidade\.reason/);
  assert.match(rota, /code: "TEXT_ACQUISITION_UNAVAILABLE"/);
  /* E o portão vem ANTES da chamada que cria o job. */
  assert.ok(
    rota.indexOf("if (!capacidade.available)") < rota.indexOf("enqueueRadarVideoTextJob({"),
    "a recusa precede o enfileiramento",
  );
});

/* ==========  C · DOIS CLIQUES, UM JOB  =========================== */

test("VÍDEOS 2 · C — a idempotência é do banco, não de um debounce de tela", () => {
  const sql = migracao();

  /*
   * O ÍNDICE É PARCIAL, e isso é o ponto: ele impede o segundo job enquanto o
   * primeiro está vivo, e libera o reprocessamento deliberado depois que ele
   * termina. Um índice total travaria a fonte para sempre no primeiro sucesso.
   */
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_external_job_video_source_active/);
  assert.match(sql, /ON public\.external_processing_jobs \(video_source_id, job_kind\)/);
  assert.match(sql, /WHERE video_source_id IS NOT NULL\s*\r?\n\s*AND status IN \('RECEIVED', 'PENDING_LOCAL_PROCESSING', 'PROCESSING', 'FAILED_RETRYABLE'\)/);

  /* A violação de unicidade é lida como REUSO, nunca como erro. */
  assert.match(persistencia(), /if \(resultado\.error\?\.code === "23505"\) return \{ duplicate: true as const, jobId: null \}/);
  assert.match(rotaExtracao(), /reused: enfileirado\.duplicate/);
  /* E a resposta de duplicata continua sendo sucesso: o job existe. */
  assert.match(rotaExtracao(), /success: true,\s*\r?\n\s*queued: !enfileirado\.duplicate/);
});

/* ==========  D · O JOB PERTENCE À FONTE E À MARCA  =============== */

test("VÍDEOS 2 · D — o job de vídeo aponta para a fonte, nunca para uma contribuição", () => {
  const sql = migracao();

  /*
   * FK COMPOSTA — o padrão do projeto contra vínculo cruzado entre marcas.
   *
   * São DUAS, e por isso cada uma é conferida pelo NOME da constraint: a
   * primeira versão deste teste casava o formato genérico, e uma mutação que
   * destruía a chave composta do job continuava passando porque a do texto,
   * intacta, satisfazia a expressão.
   */
  const composta = (constraint: string) =>
    new RegExp(`CONSTRAINT ${constraint}\\s*\\r?\\n\\s*FOREIGN KEY \\(brand_id, video_source_id\\)\\s*\\r?\\n\\s*REFERENCES public\\.radar_video_sources \\(brand_id, id\\)`);
  assert.match(sql, composta("fk_external_job_video_source_brand"), "o job aponta para a fonte da MESMA marca");
  assert.match(sql, composta("fk_radar_video_text_source_brand"), "o texto aponta para a fonte da MESMA marca");
  /* Nenhuma das duas pode degradar para chave simples. */
  assert.ok(!/FOREIGN KEY \(video_source_id\)\s*\r?\n\s*REFERENCES public\.radar_video_sources \(id\)/.test(sql));

  /*
   * UM SUJEITO POR JOB. Vídeo deliberado e contribuição de especialista são
   * entidades semânticas diferentes (invariante 24); um job que apontasse para
   * as duas faria a fila mentir sobre o que está processando.
   */
  assert.match(sql, /ck_external_job_subject/);
  assert.match(sql, /job_kind = 'radar_video_text_acquisition' AND video_source_id IS NOT NULL AND contribution_id IS NULL/);
  assert.match(sql, /job_kind <> 'radar_video_text_acquisition' AND video_source_id IS NULL/);

  /* E o tipo novo entrou no CHECK existente, sem criar segunda fila. */
  assert.match(sql, /ADD CONSTRAINT external_processing_jobs_job_kind_check CHECK \(job_kind IN \(/);
  assert.match(sql, /'radar_video_text_acquisition'/);
  for (const herdado of ["telegram_media_preservation", "speech_transcription", "document_extraction"]) {
    assert.ok(sql.includes(`'${herdado}'`), `o tipo ${herdado} continua aceito`);
  }
  assert.ok(!/CREATE TABLE[^;]*jobs/i.test(sql), "nenhuma segunda fila foi criada");
});

/* ==========  E, J e K · O WORKER EXISTENTE  ====================== */

test("VÍDEOS 2 · E, J e K — o runner existente é reusado, com o retry dele", () => {
  const runner = readFileSync(new URL("../lib/server/local-worker/runner.ts", import.meta.url), "utf8");

  /* O claim, o lease e o backoff continuam sendo os mesmos, já provados. */
  assert.match(runner, /claim_external_processing_job/);
  assert.match(runner, /heartbeatExternalProcessingJob/);
  assert.match(runner, /status: final \? "FAILED_FINAL" : "FAILED_RETRYABLE"/);
  assert.match(runner, /job_kind: "telegram_media_preservation" \| "speech_transcription" \| "document_extraction" \| "radar_video_text_acquisition"/);

  /*
   * O PROCESSOR NOVO É INJETADO, não um segundo worker. O runner não sabe o
   * que é vídeo: ele sabe reclamar, renovar e concluir.
   */
  assert.match(processor(), /export function createRadarVideoTextWorkerProcessor/);
  assert.ok(!/claim_external_processing_job|setInterval/.test(processor()), "o processor não reimplementa a fila");

  /*
   * K · FALHA DEFINITIVA É EXPLÍCITA — e limitação não é falha.
   *
   * `BLOCKED` tira o job da fila sem consumir tentativas; usar
   * `FAILED_RETRYABLE` para ausência de caminho traria o job de volta
   * indefinidamente para algo que nunca teve como funcionar.
   */
  assert.match(processor(), /status: "BLOCKED", payload: \{ code: "RADAR_VIDEO_ACQUISITION_UNAVAILABLE"/);
  assert.match(processor(), /state: "TEXT_ACQUISITION_UNAVAILABLE"/);
  /*
   * E NENHUM ADAPTADOR DE DOWNLOAD OU PROVIDER EXTERNO EXISTE — Gate 2.1.
   *
   * A ausência é deliberada: um adaptador vazio "para depois" seria um convite
   * silencioso a religar o caminho proibido.
   */
  assert.ok(!/mediaDownload|licensedProvider|ytdl|yt-dlp/i.test(processor()), "nenhum caminho de download sobreviveu");

  /*
   * O PROCESSOR PEDE OS TEMPOS — risco R1 fechado ponta a ponta.
   *
   * Habilitar a capacidade no adaptador do Speech não basta: se quem chama não
   * a pedir, a resposta volta sem tempo e o texto é preservado como
   * `NON_TIMESTAMPED` sem que nada acuse. É aqui que o pedido acontece.
   */
  assert.match(processor(), /enableWordTimeOffsets: true/);
  assert.match(processor(), /hasTimestamps: fala\.result\.timestampState === "TIMESTAMPED"/);
  assert.match(processor(), /segments: fala\.result\.segments/);
});

/* ==========  F, G e T · O ORIGINAL PRESERVADO  ================== */

test("VÍDEOS 2 · F, G e T — o original é preservado, no idioma dele, e o worker não guarda estado", () => {
  const sql = migracao();

  /* F · o texto e os segmentos vivem no PostgreSQL, fora do payload do workflow. */
  assert.match(sql, /transcript_text text NOT NULL CHECK \(char_length\(transcript_text\) > 0\)/);
  assert.match(sql, /segments jsonb NOT NULL DEFAULT '\[\]'::jsonb/);
  assert.match(sql, /has_timestamps boolean NOT NULL DEFAULT false/);
  /*
   * A VARREDURA É SOBRE O QUE EXECUTA, não sobre a palavra: o cabeçalho da
   * migration cita `editorial_workflow_items` justamente para explicar por que
   * o texto NÃO vai para lá. Proibir o termo proibiria a frase que garante o
   * comportamento.
   */
  const ddl = sql.replace(/--[^\n]*/g, "");
  assert.ok(!ddl.includes("editorial_workflow_items"), "o texto não entra no payload do workflow");

  /* G · o idioma original é coluna própria, e nada o traduz nesta fase. */
  assert.match(sql, /language_code text/);
  const codigo = [processor(), persistencia()].join("\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of ["translat", "traduz", "targetLanguage"]) {
    assert.ok(!codigo.toLowerCase().includes(proibido.toLowerCase()), `nada traduz: "${proibido}"`);
  }

  /*
   * O ORIGINAL NUNCA É SOBRESCRITO — §5. Reprocessar cria linha nova, e a
   * unicidade por versão é quem garante. Sem `processing_version` na chave, um
   * segundo processamento apagaria o original de ontem.
   */
  assert.match(sql, /CONSTRAINT uq_radar_video_text_version UNIQUE \(video_source_id, content_kind, processing_version\)/);
  assert.match(persistencia(), /processing_version: processingVersion/);
  assert.ok(!/from\("radar_video_source_texts"\)[\s\S]{0,200}\.update\(/.test(persistencia()), "o texto nunca é atualizado");

  /*
   * T · O WORKER NÃO MANTÉM ESTADO CANÔNICO LOCAL. Ele devolve um writeback e
   * o runner persiste; nada fica em memória entre execuções.
   */
  assert.match(processor(), /writeback: writeback as never/);
  assert.ok(!/let\s+\w+\s*=\s*(new Map|\[\]|\{\})/.test(processor()), "o processor não guarda cache próprio");
});

/* ==========  S · O PREFIXO DURÁVEL  ============================= */

test("VÍDEOS 2 · S — o artefato durável não mora em temporary/", () => {
  const brandId = "11111111-1111-4111-8111-111111111111";
  const videoSourceId = "22222222-2222-4222-8222-222222222222";

  const durável = createRadarVideoDurableObjectKey({ brandId, videoSourceId, fileName: "original.mp3", objectId: "33333333-3333-4333-8333-333333333333" });
  assert.equal(durável, `brand/${brandId}/radar/videos/${videoSourceId}/33333333-3333-4333-8333-333333333333-original.mp3`);
  assert.ok(!durável.startsWith("temporary/"), "o original não é transitório");
  assert.ok(durável.includes(brandId), "e continua tenantizado por marca");

  /*
   * O CAMINHO TRANSITÓRIO CONTINUA EXISTINDO, e é outro. `temporary/` foi
   * desenhado para processamento descartável — `removeSharedTemporaryMedia`
   * existe para apagá-lo. Guardar ali o original de uma fonte deliberada
   * contradiria o nome e o desenho.
   */
  const transitório = createBrandScopedMediaObjectKey({ brandId, source: "telegram", fileName: "audio.ogg", objectId: "44444444-4444-4444-8444-444444444444" });
  assert.ok(transitório.startsWith("temporary/brand/"), "o transitório segue transitório");
  assert.notEqual(durável.split("/")[0], transitório.split("/")[0]);

  /* Uma marca não alcança o objeto da outra pela chave. */
  assert.throws(() => createRadarVideoDurableObjectKey({ brandId: "nao-e-uuid", videoSourceId }), /brandId inválido/);
  assert.throws(() => createRadarVideoDurableObjectKey({ brandId, videoSourceId: "../outra-marca" }), /videoSourceId inválido/);
});

/* ==========  N · O RESET DA PESQUISA  ========================== */

test("VÍDEOS 2 · N — o RESET da Pesquisa não alcança fonte, texto nem job de vídeo", () => {
  const reset = readFileSync(new URL("../lib/radar/radar-reset.ts", import.meta.url), "utf8");

  for (const tabela of ["radar_video_sources", "radar_video_source_texts", "external_processing_jobs"]) {
    assert.ok(!reset.includes(tabela), `o reset não conhece ${tabela}`);
  }
  assert.ok(!RADAR_RESET_CLEARED.includes("existingContent" as never));
  assert.ok(RADAR_RESET_OUTSIDE_PAYLOAD.includes("existingContent"));

  /* E nenhuma rota de reset toca as tabelas de vídeo. */
  const workflow = readFileSync(new URL("../app/api/editorial/workflow/route.ts", import.meta.url), "utf8");
  for (const tabela of ["radar_video_sources", "radar_video_source_texts"]) {
    assert.ok(!workflow.includes(tabela), `a rota de workflow não toca ${tabela}`);
  }
});

/* ==========  R · RLS E ISOLAMENTO  ============================= */

test("VÍDEOS 2 · R — o texto preservado herda o padrão de tenant do projeto", () => {
  const sql = migracao();

  assert.match(sql, /ALTER TABLE public\.radar_video_source_texts ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE public\.radar_video_source_texts FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.radar_video_source_texts TO authenticated/);
  assert.match(sql, /GRANT SELECT, INSERT ON TABLE public\.radar_video_source_texts TO service_role/);
  assert.match(sql, /USING \(public\.can_access_brand\(brand_id\)\)/);
  /* Escrita por `authenticated` não é concedida em nenhuma forma. */
  assert.ok(!/GRANT[^;]*\b(INSERT|UPDATE|DELETE)\b[^;]*TO authenticated/.test(sql));
  /* E o texto não pode ser editado nem por quem grava. */
  assert.ok(!/GRANT[^;]*UPDATE[^;]*radar_video_source_texts/.test(sql));

  /* A rota resolve acesso E permissão de edição antes de tocar em qualquer coisa. */
  assert.match(rotaExtracao(), /resolvePipelineContext\(\{ brandId: parsed\.data\.brandId, module: "radar", action: "edit" \}\)/);
  /*
   * E confere que a fonte pertence a esta MARCA antes de enfileirar — §2.3.2.
   *
   * A conferência era por artigo, herança do modelo em que a fonte pertencia a
   * um. Desde que a biblioteca é da marca, filtrar por artigo recusaria a
   * própria fonte da marca quando o pedido vem sem artigo aberto. A fronteira
   * de tenant não enfraqueceu: ela é `context.brandId`, que vem do guard e
   * nunca do corpo da requisição.
   */
  assert.match(rotaExtracao(), /\.eq\("brand_id", context\.brandId\)\s*\r?\n\s*\.eq\("id", parsed\.data\.videoSourceId\)/);
  assert.ok(!/\.eq\("article_id", parsed\.data\.articleId\)/.test(rotaExtracao()), "a fonte não é filtrada por artigo");
  assert.match(rotaExtracao(), /A fonte não pertence à biblioteca desta marca\./);
  assert.ok(!/\.eq\("brand_id", parsed\.data\.brandId\)/.test(rotaExtracao()), "a marca do corpo nunca é autoridade");
});

/* ==========  §3 · NADA COMEÇA SOZINHO  ========================= */

test("VÍDEOS 2 · §3 — o processamento só nasce da ação humana", () => {
  const pagina = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  /* Nenhum efeito de render chama a extração. */
  for (const efeito of pagina.match(/useEffect\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/g) || []) {
    assert.ok(!/radar-video-text|extractVideoText\(/.test(efeito), "nenhum useEffect extrai texto");
  }

  /* A extração existe numa única origem, e ela é o handler do clique. */
  const painel = readFileSync(new URL("../modules/radar/radar-r3-videos-panel.tsx", import.meta.url), "utf8");
  assert.equal((painel.match(/onExtractVideoText\?\.\(/g) || []).length, 1);
  assert.match(painel, /onClick=\{\(\) => onExtractVideoText\?\.\(articleId, fonte\.id\)\}/);

  /* E a área continua declarando o que ainda não faz. */
  /* §2.3.3: a declaração de escopo virou o InfoHint de "Conteúdo extraído". */
  assert.match(painel, /title="Conteúdo extraído"/);
  assert.match(painel, /O texto extraído é preservado no idioma ORIGINAL: nada é traduzido, resumido nem reescrito\./);
  assert.match(painel, /ainda não existem/);
});

/* ==========  PROVIDER E STORAGE  =============================== */

test("VÍDEOS 2 · nenhuma rede, nenhuma escrita em Storage nesta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});
