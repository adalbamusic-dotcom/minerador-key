import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * ======  VÍDEOS · GATE 2.4.1 — O COMANDO OPERACIONAL DÁ BOOT  ========
 *
 * O smoke do 2.4 morreu antes de processar coisa alguma:
 *
 *   ERR_MODULE_NOT_FOUND  .../lib/server/local-worker/runner
 *
 * E TODOS OS TESTES ANTERIORES ESTAVAM VERDES. Eles importavam o runner pelo
 * harness — que resolve `@/` e extensões — e provavam que as FUNÇÕES
 * funcionam. Nenhum provava que `pnpm run local-worker:once` INICIA.
 *
 * A diferença entre as duas coisas é o Node ESM real, que cobra:
 *
 *   1. extensão explícita em import relativo;
 *   2. o alias `@/`, que é do `tsconfig` e ele desconhece;
 *   3. sintaxe que o modo strip-only não emite (parameter property);
 *   4. a condição `react-server`, que `server-only` usa para não explodir.
 *
 * Quatro paredes em sequência: derrubar a primeira só revelava a segunda.
 *
 * ESTE TESTE EXECUTA O COMANDO DE VERDADE, lido do `package.json` — repetir o
 * comando aqui deixaria o teste passar enquanto o script real quebra. Sem
 * `LOCAL_WORKER_RUN=1` o entrypoint recusa antes de reivindicar job, então o
 * boot é provado sem tocar banco nem provider.
 */

const raiz = new URL("..", import.meta.url);
const pacote = JSON.parse(readFileSync(new URL("package.json", raiz), "utf8")) as { scripts: Record<string, string> };

/** O comando operacional, como ele está declarado — não como eu lembro dele. */
const COMANDO = pacote.scripts["local-worker:once"];

function bootar(ambiente: Record<string, string> = {}) {
  const [executavel, ...argumentos] = COMANDO.split(/\s+/);
  try {
    const saida = execFileSync(executavel, argumentos, {
      cwd: new URL(".", raiz).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
      encoding: "utf8",
      env: {
        ...process.env,
        /* A guarda do entrypoint: sem isto ele não reivindica nada. */
        LOCAL_WORKER_RUN: "",
        LOCAL_WORKER_ACTOR_USER_ID: "",
        ...ambiente,
      },
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true as const, saida };
  } catch (erro) {
    const falha = erro as { stdout?: string; stderr?: string; status?: number };
    return { ok: false as const, saida: `${falha.stdout || ""}${falha.stderr || ""}`, status: falha.status };
  }
}

test("VÍDEOS 2.4.1 · o comando operacional do worker realmente inicia", () => {
  assert.ok(COMANDO, "o script local-worker:once existe no package.json");

  const resultado = bootar();

  /*
   * A REGRESSÃO QUE ESTE TESTE EXISTE PARA PEGAR, nomeada.
   *
   * Qualquer import novo sem extensão, ou com `@/`, em qualquer módulo do
   * grafo de boot, reaparece exatamente assim.
   */
  assert.ok(!resultado.saida.includes("ERR_MODULE_NOT_FOUND"), `boot quebrou por resolução de módulo:\n${resultado.saida}`);
  assert.ok(!resultado.saida.includes("ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX"), `boot quebrou por sintaxe que o strip-only não emite:\n${resultado.saida}`);
  assert.ok(!resultado.saida.includes("cannot be imported from a Client Component"), `boot quebrou na asserção de \`server-only\`:\n${resultado.saida}`);
  assert.ok(resultado.ok, `o comando saiu com erro:\n${resultado.saida}`);

  /*
   * E O BOOT FOI COMPLETO. Esta mensagem vem DEPOIS de todos os imports
   * estáticos terem resolvido e carregado — é o próprio entrypoint recusando
   * por falta da variável, o que só acontece se o módulo inteiro carregou.
   */
  assert.match(resultado.saida, /LOCAL_WORKER_RUN=1 não configurado; nenhum job foi executado\./);
});

test("VÍDEOS 2.4.1 · a guarda impede qualquer trabalho durante o teste de boot", () => {
  /*
   * O TESTE DE BOOT NÃO PODE REIVINDICAR JOB. Sem `LOCAL_WORKER_RUN=1` o
   * entrypoint para antes de construir o cliente de serviço — e é por isso que
   * não foi preciso inventar um segundo entrypoint "de teste": o de produção
   * já sabe não fazer nada.
   */
  const fonte = readFileSync(new URL("scripts/local-worker.mts", raiz), "utf8");
  const corpo = fonte.slice(fonte.indexOf("if (process.env.LOCAL_WORKER_RUN"));
  const guarda = corpo.slice(0, corpo.indexOf("} else {"));
  for (const proibido of ["createCanonicalServiceClient(", "runLocalWorkerOnce(", "claim"]) {
    assert.ok(!guarda.includes(proibido), `a guarda não faz "${proibido}"`);
  }
  assert.ok(
    fonte.indexOf('if (process.env.LOCAL_WORKER_RUN !== "1")') < fonte.indexOf("createCanonicalServiceClient()"),
    "a recusa vem antes de qualquer cliente",
  );

  /* E com a variável mas sem ator, também não: duas guardas, não uma. */
  const semAtor = bootar({ LOCAL_WORKER_RUN: "1" });
  assert.ok(semAtor.ok, `o comando saiu com erro:\n${semAtor.saida}`);
  assert.match(semAtor.saida, /LOCAL_WORKER_ACTOR_USER_ID não configurado; nenhum job foi executado\./);
});

test("VÍDEOS 2.4.1 · o comando declara o que o Node ESM real precisa", () => {
  /*
   * Cada bandeira aqui é uma das quatro paredes, e todas são de EXECUÇÃO:
   * nenhuma troca implementação, nenhuma injeta dublê.
   */
  assert.match(COMANDO, /--import \.\/scripts\/node-ts-register\.mjs/, "o resolvedor é registrado antes do entrypoint");
  assert.match(COMANDO, /--conditions=react-server/, "`server-only` resolve para o arquivo vazio, como num servidor");
  assert.match(COMANDO, /scripts\/local-worker\.mts$/, "e o entrypoint continua sendo o mesmo");

  /*
   * O RESOLVEDOR DE PRODUÇÃO NÃO SUBSTITUI NADA.
   *
   * O loader dos testes troca `next/headers`, `next/navigation` e o cliente
   * Supabase do browser por dublês inertes — correto num teste, e mentira num
   * worker que grava no banco real. A separação entre os dois é o ponto.
   */
  const resolvedor = readFileSync(new URL("scripts/node-ts-resolver.mjs", raiz), "utf8");
  /* Os comentários citam os nomes para EXPLICAR a separação: o alvo é o código. */
  const codigo = resolvedor.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const proibido of ["data:text/javascript", "next/headers", "next/navigation", "browser-client", "transpileModule"]) {
    assert.ok(!codigo.includes(proibido), `o resolvedor de produção não faz "${proibido}"`);
  }
  assert.ok(!codigo.includes("export function load"), "ele resolve caminho, e não carrega conteúdo");
  assert.match(codigo, /export function resolve\(/, "e resolve, que é o que ele promete");

  /* A fonte vence o build: `.ts` é procurado antes de `.js`. */
  assert.match(resolvedor, /const SUFIXOS = \[".ts", ".tsx", ".mts", ".js", ".mjs", ".json"\];/);
});

test("VÍDEOS 2.4.1 · a fila, o claim e o retry não foram tocados", () => {
  /*
   * ESTE GATE É DE BOOT. O job que já está na fila precisa continuar
   * reivindicável pelo mesmo caminho de sempre — nada de exigir um clique novo
   * em "Extrair texto".
   */
  const runner = readFileSync(new URL("lib/server/local-worker/runner.ts", raiz), "utf8");
  assert.match(runner, /claim_external_processing_job/);
  assert.match(runner, /heartbeatExternalProcessingJob/);
  assert.match(runner, /status: final \? "FAILED_FINAL" : "FAILED_RETRYABLE"/);

  /* E o roteamento por tipo de job continua sendo o do 2.2. */
  const entrypoint = readFileSync(new URL("scripts/local-worker.mts", raiz), "utf8");
  assert.match(entrypoint, /job\.job_kind === "radar_video_text_acquisition" \? video\(job\) : especialista\(job\)/);
  assert.equal((entrypoint.match(/runLocalWorkerOnce\(/g) || []).length, 1, "um runner só");
});
