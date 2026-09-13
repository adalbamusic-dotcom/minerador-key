import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_AREA_POLL_OPEN_MS,
  RADAR_AREA_POLL_PENDING_MS,
  RADAR_AREA_SIGNAL_DEBOUNCE_MS,
  RADAR_LIVE_AREAS,
  createRadarAreaCache,
  radarAreaCacheKey,
  radarAreaPollingPlan,
  radarAreaShouldCoalesce,
  radarAreaShouldRevalidateOnVisible,
  radarLiveSignalFromSubscription,
} from "../lib/radar/area-live-read.ts";

/**
 * A POLÍTICA DA LEITURA VIVA — exercida sem React, sem rede e sem Supabase.
 *
 * O que este arquivo protege é a decisão: quando vale perguntar de novo, quando
 * é desperdício, e o que acontece quando o Realtime não está disponível — que é
 * o caso que NÃO dá para descartar, porque não se sabe por leitura se as tabelas
 * estão na publication.
 */

const contexto = {
  brandId: "90000000-0000-4000-8000-0000000000b1",
  articleId: "article-live-ux",
  articleDnaVersionId: "dna-v1",
  area: "specialist" as const,
};

/* ============================== a chave ============================== */

test("LIVE_UX_2 · a chave separa marca, artigo, VERSÃO e área", () => {
  const base = radarAreaCacheKey(contexto);

  assert.notEqual(radarAreaCacheKey({ ...contexto, articleId: "outro" }), base);
  assert.notEqual(radarAreaCacheKey({ ...contexto, area: "videos" }), base);
  /*
   * A VERSÃO É A METADE DA IDENTIDADE QUE MUDA SEM O ARTIGO MUDAR.
   *
   * Sem ela, aprovar uma versão nova mostraria o read-model da anterior como se
   * fosse o atual — mesmo artigo, outro contrato editorial.
   */
  assert.notEqual(radarAreaCacheKey({ ...contexto, articleDnaVersionId: "dna-v2" }), base);
});

test("LIVE_UX_2 · as quatro áreas do Radar têm leitura própria", () => {
  assert.deepEqual([...RADAR_LIVE_AREAS], ["research", "videos", "specialist", "report"]);
});

/* ====================== o estado do sinal ========================== */

test("LIVE_UX_2 · só SUBSCRIBED conta como sinal vivo", () => {
  assert.equal(radarLiveSignalFromSubscription("SUBSCRIBED"), "LIVE");

  /* Erro, timeout e fechamento levam ao mesmo lugar: viver do tique. */
  for (const status of ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]) {
    assert.equal(radarLiveSignalFromSubscription(status), "UNAVAILABLE", status);
  }
  /* O que ainda não se sabe não é indisponível — nem vivo. */
  assert.equal(radarLiveSignalFromSubscription("JOINING"), "CONNECTING");
  assert.equal(radarLiveSignalFromSubscription(""), "CONNECTING");
});

/* ==================== §17 · sem publication ======================== */

test("LIVE_UX_2 · sem Realtime disponível, o tique da ÁREA assume", () => {
  /*
   * O CASO QUE NÃO DÁ PARA DESCARTAR.
   *
   * Não se sabe por leitura se a tabela está na publication `supabase_realtime`.
   * Em vez de travar o produto esperando confirmação, a assinatura é tentada e o
   * resultado observado — e uma área sem sinal vivo se atualiza por tique.
   */
  const comTrabalho = radarAreaPollingPlan({ signal: "UNAVAILABLE", activity: { open: true, pending: true }, visible: true });
  assert.equal(comTrabalho.shouldPoll, true);
  assert.equal(comTrabalho.intervalMs, RADAR_AREA_POLL_PENDING_MS);
  assert.equal(comTrabalho.reason, "PENDING_WORK");

  const soAberta = radarAreaPollingPlan({ signal: "UNAVAILABLE", activity: { open: true, pending: false }, visible: true });
  assert.equal(soAberta.shouldPoll, true);
  assert.equal(soAberta.intervalMs, RADAR_AREA_POLL_OPEN_MS);
  assert.equal(soAberta.reason, "AREA_OPEN");
});

test("LIVE_UX_2 · com Realtime vivo, o tique não roda", () => {
  const plano = radarAreaPollingPlan({ signal: "LIVE", activity: { open: true, pending: true }, visible: true });

  assert.equal(plano.shouldPoll, false, "sinal vivo dispensa perguntar de novo");
  assert.equal(plano.reason, "LIVE_SIGNAL");
});

test("LIVE_UX_2 · área fechada e sem trabalho não é consultada", () => {
  const plano = radarAreaPollingPlan({ signal: "UNAVAILABLE", activity: { open: false, pending: false }, visible: true });
  assert.equal(plano.shouldPoll, false);
  assert.equal(plano.reason, "IDLE");
});

test("LIVE_UX_2 · trabalho pendente vale tique mesmo com a área fechada", () => {
  /* Um envio aguardando resposta continua sendo esperado com o card recolhido. */
  const plano = radarAreaPollingPlan({ signal: "UNAVAILABLE", activity: { open: false, pending: true }, visible: true });
  assert.equal(plano.shouldPoll, true);
  assert.equal(plano.intervalMs, RADAR_AREA_POLL_PENDING_MS);
});

test("LIVE_UX_2 · aba escondida pausa o tique, mesmo com trabalho pendente", () => {
  const plano = radarAreaPollingPlan({ signal: "UNAVAILABLE", activity: { open: true, pending: true }, visible: false });
  assert.equal(plano.shouldPoll, false);
  assert.equal(plano.reason, "HIDDEN");
});

test("LIVE_UX_2 · o intervalo respeita a faixa pedida e não é busy-loop", () => {
  assert.ok(RADAR_AREA_POLL_PENDING_MS >= 3_000 && RADAR_AREA_POLL_PENDING_MS <= 5_000, "3–5 s com trabalho em curso");
  /* Área aberta e estável não merece o mesmo ritmo de quem está esperando algo. */
  assert.ok(RADAR_AREA_POLL_OPEN_MS > RADAR_AREA_POLL_PENDING_MS);
});

/* ===================== voltar para a aba ========================== */

test("LIVE_UX_2 · voltar à aba revalida uma vez, e só com algo a revalidar", () => {
  assert.equal(radarAreaShouldRevalidateOnVisible({ becameVisible: true, hasCachedValue: true }), true);
  /* Sem cache, quem pede a leitura é o efeito de primeira carga, não este. */
  assert.equal(radarAreaShouldRevalidateOnVisible({ becameVisible: true, hasCachedValue: false }), false);
  assert.equal(radarAreaShouldRevalidateOnVisible({ becameVisible: false, hasCachedValue: true }), false);
});

/* ======================== o coalescing ============================ */

test("LIVE_UX_2 · eventos próximos viram uma leitura só", () => {
  /*
   * Uma contribuição de áudio produz vários eventos em sequência: a contribuição
   * entra, a pauta muda de estado, o job de mídia é enfileirado. Sem coalescing
   * seriam três leituras para mostrar uma resposta.
   */
  assert.equal(radarAreaShouldCoalesce({ lastSignalAt: 1_000, now: 1_100 }), true);
  assert.equal(radarAreaShouldCoalesce({ lastSignalAt: 1_000, now: 1_000 + RADAR_AREA_SIGNAL_DEBOUNCE_MS }), false);
  assert.equal(radarAreaShouldCoalesce({ lastSignalAt: 1_000, now: 5_000 }), false);
  /* O primeiro sinal nunca é engolido. */
  assert.equal(radarAreaShouldCoalesce({ lastSignalAt: null, now: 1_000 }), false);
});

/* ========================= o cache ================================ */

test("LIVE_UX_2 · o cache devolve o que já se sabia, por chave", () => {
  const cache = createRadarAreaCache<{ respostas: number }>();
  const chave = radarAreaCacheKey(contexto);

  assert.equal(cache.get(chave), null);
  cache.set(chave, { respostas: 1 }, 1_000);
  assert.deepEqual(cache.get(chave)?.value, { respostas: 1 });
  assert.equal(cache.get(chave)?.loadedAt, 1_000);
  assert.equal(cache.get(chave)?.revalidating, false);

  cache.markRevalidating(chave, true);
  assert.equal(cache.get(chave)?.revalidating, true, "revalidando não apaga o valor");
  assert.deepEqual(cache.get(chave)?.value, { respostas: 1 });
});

test("LIVE_UX_2 · o cache de um artigo nunca responde por outro", () => {
  const cache = createRadarAreaCache<{ respostas: number }>();
  cache.set(radarAreaCacheKey(contexto), { respostas: 2 }, 1_000);

  assert.equal(cache.get(radarAreaCacheKey({ ...contexto, articleId: "outro" })), null);
  assert.equal(cache.get(radarAreaCacheKey({ ...contexto, articleDnaVersionId: "dna-v2" })), null);
  assert.equal(cache.get(radarAreaCacheKey({ ...contexto, area: "videos" })), null);
});

test("LIVE_UX_2 · trocar de artigo descarta o que era do anterior", () => {
  const cache = createRadarAreaCache<number>();
  for (const area of RADAR_LIVE_AREAS) cache.set(radarAreaCacheKey({ ...contexto, area }), 1, 1_000);
  cache.set(radarAreaCacheKey({ ...contexto, articleId: "outro", area: "specialist" }), 2, 1_000);
  assert.equal(cache.size(), 5);

  cache.invalidatePrefix(`${contexto.brandId}:${contexto.articleId}:`);
  assert.equal(cache.size(), 1, "sobra só o do outro artigo");
  assert.equal(cache.get(radarAreaCacheKey({ ...contexto, articleId: "outro", area: "specialist" }))?.value, 2);
});

test("LIVE_UX_2 · invalidar uma área não derruba as vizinhas", () => {
  const cache = createRadarAreaCache<number>();
  for (const area of RADAR_LIVE_AREAS) cache.set(radarAreaCacheKey({ ...contexto, area }), 1, 1_000);

  cache.invalidate(radarAreaCacheKey({ ...contexto, area: "specialist" }));
  assert.equal(cache.get(radarAreaCacheKey({ ...contexto, area: "specialist" })), null);
  assert.equal(cache.get(radarAreaCacheKey({ ...contexto, area: "videos" }))?.value, 1);
});

/* ============== o que a implementação não pode fazer ============== */

test("LIVE_UX_2 · o domínio da política é puro", async () => {
  const fonte = await readFile(new URL("../lib/radar/area-live-read.ts", import.meta.url), "utf8");
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, "");

  assert.ok(!/fetch\(|createClient|supabase|useState|useEffect|localStorage/.test(semComentarios));
  /* E nenhum temporizador escondido: o hook é quem agenda. */
  assert.ok(!/setInterval|setTimeout/.test(semComentarios));
});

test("LIVE_UX_2 · o evento é SINAL, nunca autoridade editorial", async () => {
  const hook = await readFile(new URL("../modules/radar/use-radar-area-live-read.ts", import.meta.url), "utf8");
  const semComentarios = hook.replace(/\/\*[\s\S]*?\*\//g, "");

  /*
   * O payload do `postgres_changes` NÃO pode virar estado: um INSERT bruto não
   * sabe de projeção, de permissão nem das regras que o read-model aplica. O
   * handler do evento não recebe argumento algum — ele só sinaliza.
   */
  assert.match(semComentarios, /\(\) => \{\s*if \(ativo\) sinalizar\(\);\s*\}/, "o handler ignora o payload");
  assert.ok(!/payload\.new|payload\.old|\.new\b/.test(semComentarios), "nada é lido do evento");
  assert.match(semComentarios, /carregar\.current\(controller\.signal\)/, "a leitura é do read-model");
});

test("LIVE_UX_2 · o tique é da área, nunca do workspace", async () => {
  const hook = await readFile(new URL("../modules/radar/use-radar-area-live-read.ts", import.meta.url), "utf8");
  const semComentarios = hook.replace(/\/\*[\s\S]*?\*\//g, "");

  /* FULL_WORKSPACE_POLLING = NO: o hook não conhece o contexto do pipeline. */
  assert.ok(!/useReadyPipeline|useEditorialPipeline|editorial\/workspace|router\.refresh/.test(semComentarios));
  assert.match(semComentarios, /setInterval\(\(\) => \{/);
  assert.match(semComentarios, /void buscar\(chaveAtual\.current, "revalidate"\);/);
  /*
   * O plano é reavaliado A CADA TIQUE, não só ao agendar: um estado que ficou
   * estável no meio do caminho para de ser consultado sem esperar o efeito
   * remontar. Antes o hook decidia uma vez, no render.
   */
  assert.match(semComentarios, /if \(!planoInicial\.shouldPoll\) return;/);
  assert.match(semComentarios, /if \(!agora\.shouldPoll\) return;/);

  /*
   * O INTERVALO VEM DO PLANO, e não de um número escrito à mão.
   *
   * Sem esta asserção, trocar `planoInicial.intervalMs` por um literal passava
   * despercebido — e um tique de 50 ms é o busy-loop que o gate proíbe, com a
   * política inteira intacta logo acima. Provado por mutação.
   */
  assert.match(semComentarios, /\}, planoInicial\.intervalMs\);/);
  assert.ok(!/setInterval\([\s\S]{0,400}\},\s*\d+\);/.test(semComentarios), "nenhum intervalo literal");
});

test("LIVE_UX_2 · a leitura de outra chave nunca é aplicada", async () => {
  const hook = await readFile(new URL("../modules/radar/use-radar-area-live-read.ts", import.meta.url), "utf8");
  const semComentarios = hook.replace(/\/\*[\s\S]*?\*\//g, "");

  /* Trocar de artigo durante uma leitura não pode pintar o read-model anterior. */
  assert.match(semComentarios, /if \(controller\.signal\.aborted \|\| chaveAtual\.current !== chave\) return;/);
  assert.equal((semComentarios.match(/chaveAtual\.current !== chave/g) || []).length, 2, "vale no sucesso e no erro");
});

test("LIVE_UX_2 · PROVIDER_AUTO_RUNS = 0: a leitura viva nunca dispara provider", async () => {
  const hook = await readFile(new URL("../modules/radar/use-radar-area-live-read.ts", import.meta.url), "utf8");
  const dominio = await readFile(new URL("../lib/radar/area-live-read.ts", import.meta.url), "utf8");

  for (const [nome, fonte] of [["hook", hook], ["domínio", dominio]] as const) {
    const limpo = fonte.replace(/\/\*[\s\S]*?\*\//g, "");
    /* Nenhum POST, nenhuma ação: realtime, tique e refresh são só leitura. */
    assert.ok(!/method:\s*"POST"|method:\s*"PATCH"|method:\s*"PUT"|method:\s*"DELETE"/.test(limpo), `${nome} não escreve`);
    assert.ok(!/serp|speech|youtube|telegram|matching|analyze/i.test(limpo.replace(/import[^;]+;/g, "")), `${nome} não aciona provider`);
  }
});
