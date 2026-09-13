import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  runLocalWorkerContinuously,
  LOCAL_WORKER_IDLE_DELAY_MS,
  LOCAL_WORKER_FAILURE_DELAY_MS,
} from "../lib/server/local-worker/continuous.ts";
import type { ExternalProcessingJob } from "../lib/server/local-worker/runner.ts";

/*
 * ======  GATE · O WORKER LOCAL VIRA SERVIÇO  ==========================
 *
 * O Local Worker era `run-once`: uma execução, um job. Quem operava tinha de
 * rodar o comando de novo para cada fonte de vídeo — e o smoke do VIDEOS_2.4
 * parou exatamente aí, com o job `QUEUED` esperando alguém lembrar de chamar o
 * processo outra vez.
 *
 * O QUE ESTE GATE NÃO FEZ, e os testes provam:
 *
 *   nenhuma fila nova        `external_processing_jobs` continua sendo a fila
 *   nenhum runner novo       `runLocalWorkerOnce` continua reivindicando,
 *                            mantendo lease, aplicando writeback e completando
 *   nenhum processor novo    o roteamento por `job_kind` é o mesmo
 *   nenhum polling no browser
 *
 * O laço é um laço: ele decide quando CONTINUAR, e nada mais. Por isso todo o
 * comportamento de fila continua vindo do runner, e é o runner injetado que os
 * testes abaixo observam — sem relógio real, sem banco, sem provider.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const raiz = new URL("..", import.meta.url);
const pacote = JSON.parse(readFileSync(new URL("package.json", raiz), "utf8")) as { scripts: Record<string, string> };

const job = (patch: Partial<ExternalProcessingJob> & { id: string }): ExternalProcessingJob => ({
  brand_id: "marca-1", brief_id: null, contribution_id: null,
  job_kind: "radar_video_text_acquisition", status: "PROCESSING",
  attempts: 0, max_attempts: 5, payload: {}, claimed_by: "worker-teste",
  ...patch,
});

/**
 * Um `runLocalWorkerOnce` de mentira, dirigido por um roteiro.
 *
 * Cada entrada do roteiro é uma volta do laço. O teste controla exatamente o
 * que a fila devolve e quando, que é o que permite provar "fila vazia não
 * encerra" sem esperar quatro segundos de verdade.
 */
function runnerDeRoteiro(roteiro: Array<{ status: "PROCESSED" | "EMPTY" | "FAILED"; job?: ExternalProcessingJob }>) {
  const chamadas: string[] = [];
  let indice = 0;
  const executar = async (input: { workerId: string }) => {
    chamadas.push(input.workerId);
    const passo = roteiro[Math.min(indice, roteiro.length - 1)];
    indice += 1;
    return { status: passo.status, job: passo.job || null } as Awaited<ReturnType<typeof runLocalWorkerContinuously>> extends never ? never : never;
  };
  return { executar: executar as never, chamadas, get voltas() { return indice; } };
}

/**
 * Um sinal que aborta depois de N VOLTAS — o SIGINT do teste.
 *
 * Conta voltas, não esperas: o laço só dorme em algumas delas, e amarrar a
 * parada ao sono fazia o roteiro terminar num ponto diferente do pretendido.
 */
function pararDepoisDe(voltas: number) {
  const estado = { aborted: false, voltas: 0 };
  return {
    get aborted() { return estado.aborted; },
    registra() {
      estado.voltas += 1;
      if (estado.voltas >= voltas) estado.aborted = true;
    },
  };
}

/* ==========  1 e 2 · FILA VAZIA NÃO ENCERRA  ======================== */

test("worker contínuo · fila vazia não encerra o processo, e o job seguinte é capturado", async () => {
  const parada = pararDepoisDe(3);
  const esperas: number[] = [];
  const capturados: string[] = [];

  const processado = job({ id: "job-tardio" });
  const roteiro = runnerDeRoteiro([
    { status: "EMPTY" },
    { status: "EMPTY" },
    { status: "PROCESSED", job: processado },
  ]);

  const relatorio = await runLocalWorkerContinuously({
    workerId: "w1",
    processor: async () => ({ status: "COMPLETED" }),
    runOnce: roteiro.executar,
    sleep: async (ms) => { esperas.push(ms); },
    signal: parada,
    onCycle: ({ job: capturado }) => { parada.registra(); if (capturado) capturados.push(capturado.id); },
  });

  /*
   * DUAS VOLTAS VAZIAS NÃO PARARAM O LAÇO — era isto que o `run-once` não
   * conseguia fazer: ele terminava no primeiro EMPTY e devolvia o terminal.
   */
  assert.equal(relatorio.idle, 2);
  assert.equal(relatorio.processed, 1, "o job que chegou DEPOIS da fila vazia foi capturado");
  assert.deepEqual(capturados, ["job-tardio"]);
  assert.equal(relatorio.stoppedBy, "SIGNAL", "só o sinal encerra");

  /* E cada volta vazia esperou — sem isso o laço queimaria CPU contra o banco. */
  assert.deepEqual(esperas, [LOCAL_WORKER_IDLE_DELAY_MS, LOCAL_WORKER_IDLE_DELAY_MS]);
});

/* ==========  3 · DOIS JOBS EM SEQUÊNCIA, SEM ESPERA ENTRE ELES  ==== */

test("worker contínuo · dois jobs são processados em sequência, sem pausa entre eles", async () => {
  const parada = pararDepoisDe(4);
  const esperas: number[] = [];
  const ordem: string[] = [];

  const roteiro = runnerDeRoteiro([
    { status: "PROCESSED", job: job({ id: "primeiro" }) },
    { status: "PROCESSED", job: job({ id: "segundo" }) },
    { status: "EMPTY" },
  ]);

  const relatorio = await runLocalWorkerContinuously({
    workerId: "w1",
    processor: async () => ({ status: "COMPLETED" }),
    runOnce: roteiro.executar,
    sleep: async (ms) => { esperas.push(ms); },
    signal: parada,
    onCycle: ({ job: capturado }) => { parada.registra(); if (capturado) ordem.push(capturado.id); },
  });

  assert.deepEqual(ordem, ["primeiro", "segundo"], "a fila é drenada na ordem");
  assert.equal(relatorio.processed, 2);

  /*
   * NENHUMA ESPERA ENTRE OS DOIS.
   *
   * Só houve pausa quando a fila esvaziou. Se o laço dormisse a cada volta,
   * três fontes enfileiradas levariam três ciclos ociosos para terminar — o
   * oposto do que um serviço contínuo deve fazer.
   */
  assert.deepEqual(esperas, [LOCAL_WORKER_IDLE_DELAY_MS], "a única espera foi a da fila vazia");
});

/* ==========  4 · FALHA RESPEITA O BACKOFF DO RUNNER  =============== */

test("worker contínuo · FAILED não vira laço apertado, e o backoff continua sendo do runner", async () => {
  const parada = pararDepoisDe(2);
  const esperas: number[] = [];
  const voltas: string[] = [];

  const roteiro = runnerDeRoteiro([
    { status: "FAILED", job: job({ id: "falhou", attempts: 1 }) },
    { status: "EMPTY" },
  ]);

  const relatorio = await runLocalWorkerContinuously({
    workerId: "w1",
    processor: async () => ({ status: "COMPLETED" }),
    runOnce: roteiro.executar,
    sleep: async (ms) => { esperas.push(ms); },
    signal: parada,
    onCycle: ({ status }) => { parada.registra(); voltas.push(status); },
  });

  assert.equal(relatorio.failed, 1);
  assert.deepEqual(voltas, ["FAILED", "EMPTY"], "a volta seguinte já não enxergou o job");
  assert.deepEqual(esperas, [LOCAL_WORKER_FAILURE_DELAY_MS]);

  /*
   * O BACKOFF DE VERDADE NÃO ESTÁ AQUI — e é isso que este teste fixa.
   *
   * `failExternalProcessingJob` empurra `available_at` para frente, e o claim
   * seguinte simplesmente não enxerga o job: é por isso que a volta seguinte
   * devolveu EMPTY. A pausa curta acima é só um freio contra o caso patológico
   * de um job voltar reivindicável de imediato.
   */
  const runner = readFileSync(new URL("lib/server/local-worker/runner.ts", raiz), "utf8");
  assert.match(runner, /status: final \? "FAILED_FINAL" : "FAILED_RETRYABLE"/);
  assert.match(runner, /available_at: new Date\(Date\.now\(\) \+ \(final \? 0 : Math\.min\(input\.job\.attempts \* 60_000, 15 \* 60_000\)\)\)/);

  /*
   * A varredura é sobre o CÓDIGO: o comentário do laço cita `available_at` de
   * propósito, para dizer que o backoff mora no runner. Casar com ele
   * reprovaria o arquivo correto, e apagar o comentário o tornaria pior.
   */
  const laco = readFileSync(new URL("lib/server/local-worker/continuous.ts", raiz), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.equal(/available_at|max_attempts|backoff\s*=/.test(laco), false, "o laço não reimplementa retry");
  assert.equal(/claim_external_processing_job|\.rpc\(|\.from\(/.test(laco), false, "SECOND_QUEUE_CREATED = NO: o laço não toca a fila");
});

/* ==========  5 e 6 · O ROTEAMENTO POR job_kind É O MESMO  ========== */

test("worker contínuo · vídeo vai ao processor de vídeo, especialista ao dele", () => {
  /*
   * O ROTEAMENTO NÃO FOI DUPLICADO — ele é o mesmo objeto, montado uma vez
   * antes de escolher o modo. Um segundo script teria copiado este `if`, e foi
   * exatamente uma cópia esquecida que deixou o processor de vídeo existindo,
   * testado e não LIGADO, com a fonte parada em `QUEUED`.
   */
  const script = readFileSync(new URL("scripts/local-worker.mts", raiz), "utf8");

  assert.match(script, /const processor = \(job: ExternalProcessingJob\) =>\s*\r?\n?\s*job\.job_kind === "radar_video_text_acquisition" \? video\(job\) : especialista\(job\);/);
  assert.equal((script.match(/job_kind === "radar_video_text_acquisition"/g) || []).length, 1, "um só roteamento");

  /* E os dois modos recebem o MESMO processor. */
  assert.match(script, /await runLocalWorkerOnce\(\{ workerId, processor, client \}\)/);
  assert.match(script, /runLocalWorkerContinuously\(\{\s*\r?\n?\s*workerId, processor, client,/);

  /* Nenhum worker específico de vídeo nasceu. */
  assert.equal(/createRadarVideoWorker|videoWorkerLoop|runVideoWorker/.test(script), false, "SECOND_RUNNER_CREATED = NO");
});

/* ==========  8 · ENCERRAMENTO COOPERATIVO  ======================== */

test("worker contínuo · o sinal impede o próximo claim, não interrompe o job atual", async () => {
  const parada = { aborted: false };
  const roteiro = runnerDeRoteiro([{ status: "PROCESSED", job: job({ id: "em-andamento" }) }, { status: "PROCESSED", job: job({ id: "nao-deveria" }) }]);

  const relatorio = await runLocalWorkerContinuously({
    workerId: "w1",
    processor: async () => ({ status: "COMPLETED" }),
    runOnce: roteiro.executar,
    sleep: async () => {},
    signal: parada,
    /* O sinal chega DURANTE o primeiro job: a volta atual termina, a próxima não começa. */
    onCycle: () => { parada.aborted = true; },
  });

  assert.equal(relatorio.cycles, 1, "nenhum claim novo depois do sinal");
  assert.equal(relatorio.processed, 1, "e o job em andamento foi concluído");

  /*
   * O ABANDONO SERIA PIOR QUE A ESPERA.
   *
   * Matar no meio devolveria a fonte ao limbo com o lease ainda válido:
   * ninguém poderia reivindicá-la até ele expirar. Por isso a parada é
   * consultada ANTES do claim, e o script diz isso a quem operou.
   */
  const script = readFileSync(new URL("scripts/local-worker.mts", raiz), "utf8");
  assert.match(script, /encerrando após o job atual\. Nenhum job novo será reivindicado\./);
  assert.match(script, /for \(const sinal of \["SIGINT", "SIGTERM"\] as const\)/);

  const laco = readFileSync(new URL("lib/server/local-worker/continuous.ts", raiz), "utf8");
  assert.match(laco, /while \(!input\.signal\?\.aborted\)/, "a parada é conferida antes de reivindicar");
});

/* ==========  O COMANDO E O QUE ELE NÃO EXIGE  ===================== */

test("worker contínuo · o comando existe, inicia sozinho e não exige LOCAL_WORKER_RUN", () => {
  const continuo = pacote.scripts["local-worker"];
  const umaVez = pacote.scripts["local-worker:once"];

  assert.ok(continuo, "pnpm run local-worker existe");
  assert.ok(umaVez, "LOCAL_WORKER_ONCE_PRESERVED = YES");
  assert.match(continuo, /scripts\/local-worker\.mts --continuous$/);
  assert.equal(umaVez, continuo.replace(" --continuous", ""), "os dois modos são o MESMO script");

  /*
   * A TRAVA CONTINUA SENDO DO `once`.
   *
   * `LOCAL_WORKER_RUN=1` existe para que rodar o script sem querer não consuma
   * um job durante um smoke. Pedi-la também no modo contínuo seria exigir
   * cerimônia para começar um serviço que a pessoa acabou de mandar começar.
   */
  const script = readFileSync(new URL("scripts/local-worker.mts", raiz), "utf8");
  assert.match(script, /if \(!continuo && process\.env\.LOCAL_WORKER_RUN !== "1"\)/, "MANUAL_RUN_PER_JOB_REQUIRED = NO");

  /* E o ator é validado ANTES do laço: inválido, o worker não entra nele. */
  const validacao = script.indexOf("const problemaDoAtor = atorInvalido(actorUserId);");
  const laco = script.indexOf("runLocalWorkerContinuously({");
  assert.ok(validacao > 0 && laco > validacao, "o UUID é conferido antes de entrar no laço");
});

test("worker contínuo · o comando `once` real continua iniciando e recusando sem a trava", () => {
  const [executavel, ...argumentos] = pacote.scripts["local-worker:once"].split(/\s+/);
  let saida = "";
  try {
    saida = execFileSync(executavel, argumentos, {
      cwd: new URL(".", raiz).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
      encoding: "utf8",
      env: { ...process.env, LOCAL_WORKER_RUN: "", LOCAL_WORKER_ACTOR_USER_ID: "" },
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (erro) {
    const falha = erro as { stdout?: string; stderr?: string };
    saida = `${falha.stdout || ""}${falha.stderr || ""}`;
  }

  /*
   * O MESMO ARQUIVO PASSOU A SERVIR AOS DOIS MODOS — e o `once` não mudou.
   *
   * Sem `--continuous` e sem a trava, ele recusa antes de construir o cliente
   * de serviço: nenhum job é reivindicado, e o boot inteiro foi provado porque
   * esta frase só sai depois de todos os imports carregarem.
   */
  assert.match(saida, /LOCAL_WORKER_RUN=1 não configurado; nenhum job foi executado\./);
  assert.ok(!saida.includes("ERR_MODULE_NOT_FOUND"), `o boot quebrou:\n${saida}`);
});

test("worker contínuo · o comando `local-worker` real inicia e recusa ator inválido antes do laço", () => {
  const [executavel, ...argumentos] = pacote.scripts["local-worker"].split(/\s+/);
  let saida = "";
  try {
    saida = execFileSync(executavel, argumentos, {
      cwd: new URL(".", raiz).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
      encoding: "utf8",
      /*
       * O ATOR É APAGADO DE PROPÓSITO.
       *
       * Com um ator válido este comando entraria no laço e reivindicaria os
       * jobs REAIS da fila — chamando provider durante um teste. Sem ele, o
       * script recusa antes de construir o cliente de serviço, e ainda assim
       * prova o boot inteiro: a frase só sai depois de todos os imports
       * estáticos resolverem, inclusive o módulo do laço.
       */
      env: { ...process.env, LOCAL_WORKER_ACTOR_USER_ID: "" },
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (erro) {
    const falha = erro as { stdout?: string; stderr?: string };
    saida = `${falha.stdout || ""}${falha.stderr || ""}`;
  }

  assert.match(saida, /LOCAL_WORKER_ACTOR_USER_ID_REQUIRED/, "o ator é validado antes do laço");
  assert.ok(!saida.includes("ERR_MODULE_NOT_FOUND"), `o boot do modo contínuo quebrou:\n${saida}`);
  assert.ok(!saida.includes("cannot be imported from a Client Component"), `\`server-only\` barrou o boot:\n${saida}`);
  /* E ele NÃO pediu a trava de homologação: o comando contínuo se inicia sozinho. */
  assert.ok(!saida.includes("LOCAL_WORKER_RUN=1 não configurado"), "o modo contínuo não exige a trava do `once`");
});

/* ==========  O NAVEGADOR CONTINUA FORA DISSO  ==================== */

test("worker contínuo · nenhum polling nasceu no browser", () => {
  const painel = readFileSync(new URL("modules/radar/radar-r3-videos-panel.tsx", raiz), "utf8");
  const pagina = readFileSync(new URL("modules/radar/radar-page.tsx", raiz), "utf8");

  for (const [nome, fonte] of [["painel", painel], ["página", pagina]] as const) {
    assert.equal(/setInterval|setTimeout\([^)]*reload|BROWSER_POLL/.test(fonte), false, `BROWSER_POLLING_FOR_PROCESSING = NO (${nome})`);
  }

  /* A tela cria job; quem processa é o worker. */
  assert.equal(/runLocalWorkerOnce|runLocalWorkerContinuously/.test(painel + pagina), false, "a tela não executa worker");
});

test("worker contínuo · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS = 0 — ${tentativasDeRede.join(", ")}`);
});
