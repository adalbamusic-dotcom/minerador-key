import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import test from "node:test";
import { radarSummarizeUserWorkerQueue, radarUserWorkerPresence, RADAR_USER_WORKER_CLAIMABLE_STATUSES, RADAR_USER_WORKER_HEARTBEAT_TTL_MS, type RadarUserWorkerJobRow } from "../lib/radar/user-worker-presence.ts";

/*
 * ======  GATE · USER_WORKER_1 — A VERCEL SERVE, A MÁQUINA PROCESSA  ====
 *
 * A arquitetura canônica:
 *
 *   Vercel (UI + enfileiramento) → Supabase (fila) → worker do usuário
 *   → providers → Supabase → interface
 *
 * A maior parte do caminho já existia: o Local Worker contínuo entregue no gate
 * anterior é este worker, e `external_processing_jobs` é esta fila. O que este
 * gate acrescenta é o COMANDO com o nome da arquitetura, a leitura operacional
 * que a tela precisa ter, e as provas de que nada pesado ficou na Vercel.
 *
 * O QUE ESTE ARQUIVO IMPEDE:
 *
 *   que o processamento volte para a Vercel por cron, queue, workflow ou
 *   route handler de longa duração;
 *   que a chave de service-role vaze para o bundle do browser;
 *   que worker desligado seja mostrado como falha da fonte.
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
const ler = (caminho: string) => readFileSync(new URL(caminho, raiz), "utf8");
const pacote = JSON.parse(ler("package.json")) as { scripts: Record<string, string>; dependencies?: Record<string, string> };

const AGORA = new Date("2026-09-13T12:00:00.000Z");
const haSegundos = (s: number) => new Date(AGORA.getTime() - s * 1000).toISOString();

/* ==========  §2 e §3 · O COMANDO  ================================== */

test("USER_WORKER_1 · `pnpm run user-worker` existe e não exige trava por job", () => {
  const comando = pacote.scripts["user-worker"];
  assert.ok(comando, "o comando da arquitetura existe");
  assert.match(comando, /scripts\/local-worker\.mts --continuous$/);

  /*
   * O MESMO WORKER, COM O NOME DA ARQUITETURA.
   *
   * Um segundo script duplicaria validação de ambiente, escolha do ator e o
   * roteamento por `job_kind` — e foi uma cópia esquecida desse roteamento que
   * já deixou o processor de vídeo existindo, testado e não LIGADO.
   */
  assert.equal(comando, pacote.scripts["local-worker"], "SECOND_RUNNER_CREATED = NO");
  assert.ok(pacote.scripts["local-worker:once"], "o modo de homologação continua");

  /*
   * E AS PROVAS DO WORKER TÊM ONDE RODAR.
   *
   * `test:radar` varre `tests/radar-*`; estas três suítes ficam de fora do
   * glob e, até aqui, de fora de qualquer script — existiam sem nunca serem
   * executadas por ninguém, que é o mesmo que não existirem no dia em que
   * alguém quebrar o worker.
   */
  const suite = pacote.scripts["test:worker"] || "";
  for (const arquivo of ["tests/local-worker-writeback.test.mts", "tests/local-worker-continuous.test.mts", "tests/user-worker-1.test.mts"]) {
    assert.ok(suite.includes(arquivo), `ORPHAN_SUITE = NO: ${arquivo} roda em \`pnpm run test:worker\``);
  }

  const script = ler("scripts/local-worker.mts");
  /* §3 · a trava por job continua sendo só do `once`. */
  assert.match(script, /if \(!continuo && process\.env\.LOCAL_WORKER_RUN !== "1"\)/, "MANUAL_COMMAND_PER_JOB = NO");
  /* §3 · o ator vem do ambiente, e não é adivinhado. */
  assert.match(script, /process\.env\.LOCAL_WORKER_ACTOR_USER_ID\?\.trim\(\) \|\| ""/);
  /*
   * Sem comentários: o script EXPLICA que não adivinha ator — "nada de primeiro
   * usuário do banco nem de dono arbitrário" — e a varredura casaria com a
   * própria explicação. Apagar o comentário para o teste passar tornaria o
   * arquivo pior.
   */
  const codigoDoScript = script.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.equal(/primeiro usuário|first user|owner\b.*fallback/i.test(codigoDoScript), false, "nenhum usuário é adivinhado");
});

/* ==========  §5 · NADA PESADO NA VERCEL  =========================== */

test("USER_WORKER_1 · nenhum worker foi parar na Vercel", () => {
  /* Não há cron, queue nem workflow declarados — e não pode haver. */
  assert.equal(existsSync(new URL("vercel.json", raiz)), false, "VERCEL_CRON_USED = NO (não há vercel.json com crons)");

  for (const dependencia of Object.keys(pacote.dependencies || {})) {
    assert.equal(/^@vercel\/(queue|workflow|cron)/.test(dependencia), false, `${dependencia} traria processamento para a Vercel`);
  }

  /*
   * NENHUMA ROTA CONSOME A FILA.
   *
   * A Vercel enfileira e LÊ; quem reivindica é o worker. Um único
   * `claim_external_processing_job` numa rota traria o processamento de volta
   * para o servidor de UI — e com ele o limite de tempo de execução.
   */
  /* URL, não `pathname`: no Windows ele volta como `/C:/...` e o open falha. */
  const rotas: Array<{ url: URL; nome: string }> = [];
  const varrer = (pasta: URL) => {
    for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
      const filho = new URL(`${entrada.name}${entrada.isDirectory() ? "/" : ""}`, pasta);
      if (entrada.isDirectory()) varrer(filho);
      else if (entrada.name === "route.ts") rotas.push({ url: filho, nome: decodeURIComponent(filho.href.split("/api/")[1] || filho.href) });
    }
  };
  varrer(new URL("app/api/", raiz));
  assert.ok(rotas.length > 10, "a varredura encontrou as rotas");

  for (const { url, nome } of rotas) {
    const fonte = readFileSync(url, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.equal(/claim_external_processing_job/.test(fonte), false, `PROCESSING_ON_VERCEL = NO: ${nome} reivindica job`);
    assert.equal(/runLocalWorkerOnce|runLocalWorkerContinuously/.test(fonte), false, `${nome} executa worker`);
    assert.equal(/maxDuration\s*=\s*(\d{3,})/.test(fonte), false, `${nome} declara execução longa`);
  }
});

/* ==========  §8 · NENHUM SEGREDO NO BROWSER  ====================== */

test("USER_WORKER_1 · a chave de service-role não alcança o bundle do cliente", () => {
  /*
   * A REGRA DO NEXT É O PREFIXO, e ela só protege quem a respeita: qualquer
   * leitura de `SUPABASE_SERVICE_ROLE_KEY` num módulo `"use client"` iria para
   * o bundle. A varredura é sobre os módulos de cliente do Radar e sobre o
   * contexto editorial, que é o maior deles.
   */
  const clientes = ["modules/radar/radar-page.tsx", "modules/radar/radar-r3-videos-panel.tsx", "components/editorial-pipeline-context.tsx"];
  for (const caminho of clientes) {
    const fonte = ler(caminho);
    assert.match(fonte, /^"use client";/, `${caminho} é módulo de cliente`);
    assert.equal(/SUPABASE_SERVICE_ROLE_KEY|GOOGLE_APPLICATION_CREDENTIALS|DATAFORSEO_PASSWORD/.test(fonte), false, `SECRETS_EXPOSED_TO_BROWSER = NO (${caminho})`);
  }

  /* E o worker guarda as credenciais dele: ele é server-side por construção. */
  const runner = ler("lib/server/local-worker/runner.ts");
  const laco = ler("lib/server/local-worker/continuous.ts");
  for (const [nome, fonte] of [["runner", runner], ["laço", laco]] as const) {
    assert.match(fonte, /^import "server-only";/, `${nome} é server-only`);
  }
});

/* ==========  §6 e §7 · A PONTE, E O QUE A TELA DIZ  =============== */

test("USER_WORKER_1 · batimento recente é a única prova de worker conectado", () => {
  const conectado = radarUserWorkerPresence({ queued: 2, processing: 1, lastHeartbeatAt: haSegundos(30), now: AGORA });
  assert.equal(conectado.state, "CONNECTED");
  assert.equal(conectado.label, "Worker conectado");
  assert.match(conectado.detail, /1 processando/);
  assert.match(conectado.detail, /2 na fila/);

  /*
   * LEASE VIVO NÃO É WORKER VIVO.
   *
   * Um job continua `PROCESSING` até o lease expirar, mesmo que o processo
   * tenha morrido. Só o batimento prova que alguém está lá — e é por isso que
   * ele, e não o status, decide esta frase.
   */
  const batimentoVelho = radarUserWorkerPresence({ queued: 0, processing: 1, lastHeartbeatAt: haSegundos(600), now: AGORA });
  assert.equal(batimentoVelho.state, "WAITING_FOR_WORKER");
  assert.match(batimentoVelho.detail, /reivindicado sem sinal de vida recente/);

  /* A janela é declarada, e o limite é conferido dos dois lados. */
  const noLimite = radarUserWorkerPresence({ queued: 1, processing: 0, lastHeartbeatAt: new Date(AGORA.getTime() - RADAR_USER_WORKER_HEARTBEAT_TTL_MS + 1_000).toISOString(), now: AGORA });
  assert.equal(noLimite.state, "CONNECTED");
  const passouDoLimite = radarUserWorkerPresence({ queued: 1, processing: 0, lastHeartbeatAt: new Date(AGORA.getTime() - RADAR_USER_WORKER_HEARTBEAT_TTL_MS - 1_000).toISOString(), now: AGORA });
  assert.equal(passouDoLimite.state, "WAITING_FOR_WORKER");
});

test("USER_WORKER_1 · worker desligado não é falha da fonte, e fila vazia não é diagnóstico", () => {
  const desligado = radarUserWorkerPresence({ queued: 3, processing: 0, lastHeartbeatAt: null, now: AGORA });
  assert.equal(desligado.state, "WAITING_FOR_WORKER");
  assert.equal(desligado.label, "Aguardando processador do usuário");
  assert.match(desligado.detail, /3 na fila/);
  assert.match(desligado.detail, /pnpm run user-worker/, "a saída é dita, não deixada para adivinhação");
  /* A frase não acusa o vídeo: não há nada a corrigir na fonte. */
  assert.equal(/falha|erro|inválid/i.test(`${desligado.label} ${desligado.detail}`), false);

  /*
   * SEM TRABALHO, NÃO SE AFIRMA NEM SE NEGA.
   *
   * Fila vazia é o estado normal de quem terminou tudo. Dizer "desligado" ali
   * transformaria ausência de trabalho em suspeita de defeito; dizer
   * "conectado" seria inventar um batimento que ninguém emitiu.
   */
  const semTrabalho = radarUserWorkerPresence({ queued: 0, processing: 0, lastHeartbeatAt: null, now: AGORA });
  assert.equal(semTrabalho.state, "UNKNOWN");
  assert.match(semTrabalho.detail, /não há como afirmar/);
});

test("USER_WORKER_1 · a leitura vem do servidor e chega à tela sem virar polling", () => {
  const rota = ler("app/api/editorial/radar-worker-status/route.ts");

  /* A rota LÊ a fila — e só lê. */
  assert.match(rota, /\.from\("external_processing_jobs"\)/);
  assert.match(rota, /\.select\("status,attempts,max_attempts,heartbeat_at"\)/);
  assert.match(rota, /\.eq\("brand_id", context\.brandId\)/, "a leitura é da marca do contexto");
  const codigoDaRota = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.equal(/claim_external_processing_job/.test(codigoDaRota), false, "a rota não reivindica nada");
  assert.equal(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(codigoDaRota), false, "READ_ONLY: a rota não escreve na fila");
  assert.equal(/export async function (POST|PUT|PATCH|DELETE)/.test(codigoDaRota), false, "só existe GET");

  /*
   * A CONTAGEM É A DO DOMÍNIO, E NÃO UMA SEGUNDA.
   *
   * Sem isto, a regra provada aqui embaixo — tentativa esgotada não é fila,
   * batimento só vale de job reivindicado — continuaria verde enquanto o
   * runtime contasse de outro jeito. Foi o único mutante que sobreviveu à
   * primeira bateria: a rota devolvendo `linhas.length` como fila.
   */
  assert.match(codigoDaRota, /worker: radarSummarizeUserWorkerQueue\(linhas\)/);
  assert.equal(/queued:|processing:|lastHeartbeatAt:/.test(codigoDaRota), false, "SECOND_COUNTING_RULE = NO: a rota não monta os números sozinha");

  /*
   * E A ROTA DAS FONTES CONTINUA SEM ENCOSTAR NA FILA — §5.
   *
   * Foi a tentação deste gate: devolver o estado do worker junto com a
   * biblioteca, que a tela já lê. Mas `radar-video-sources` é auditada para
   * provar que registrar fonte não cria nem consome trabalho, e afrouxar essa
   * auditoria para caber uma leitura enfraqueceria a única prova disso.
   */
  const rotaDasFontes = ler("app/api/editorial/radar-video-sources/route.ts");
  assert.equal(/external_processing_jobs/.test(rotaDasFontes), false, "a rota das fontes não lê a fila");

  /* A tela consome a leitura e não inventa um relógio para ela. */
  const painel = ler("modules/radar/radar-r3-videos-panel.tsx");
  assert.match(painel, /radarUserWorkerPresence\(\{ queued: vista\.worker\.queued/);
  assert.match(painel, /data-worker-state=\{leituraDoWorker\.state\}/);
  assert.equal(/setInterval|BROWSER_POLL/.test(painel), false, "BROWSER_MUST_REMAIN_OPEN = NO: nenhum polling nasceu");

  /*
   * FALHA DA FILA NÃO DERRUBA A BIBLIOTECA.
   *
   * Presença de worker é informação lateral; fonte é o assunto da área. Se a
   * leitura da fila falhar, a linha some — e some sem afirmar "desligado",
   * porque não saber e estar desligado são coisas diferentes.
   */
  const pagina = ler("modules/radar/radar-page.tsx");
  assert.match(pagina, /radar-worker-status\?brandId=\$\{encodeURIComponent\(brandId\)\}/);
  const leitura = pagina.slice(pagina.indexOf("const lerEstadoDoWorker"));
  const fimDaLeitura = leitura.indexOf("const loadVideoLibrary");
  assert.ok(fimDaLeitura > 0, "a função da fila existe e é própria");
  assert.match(leitura.slice(0, fimDaLeitura), /catch \{\s*\r?\n?\s*return null;/, "falha de fila devolve null, não estado inventado");
});

/* ==========  §6 · A REGRA DE CONTAGEM, QUE É ONDE SE MENTE  ======= */

test("USER_WORKER_1 · tentativa esgotada não é fila, e batimento só vale de job reivindicado", () => {
  const linha = (status: string, extras: Partial<RadarUserWorkerJobRow> = {}): RadarUserWorkerJobRow =>
    ({ status, attempts: 0, maxAttempts: 3, heartbeatAt: null, ...extras });

  /*
   * O JOB QUE NINGUÉM VAI BUSCAR NÃO ESTÁ ESPERANDO NINGUÉM.
   *
   * `FAILED_RETRYABLE` com as tentativas gastas fica fora do `WHERE` do claim.
   * Contá-lo como fila produziria um "aguardando processador" que ligar o
   * worker não apaga — e mandaria a pessoa procurar defeito onde não há.
   */
  const esgotado = radarSummarizeUserWorkerQueue([linha("FAILED_RETRYABLE", { attempts: 3, maxAttempts: 3 })]);
  assert.deepEqual(esgotado, { queued: 0, processing: 0, lastHeartbeatAt: null });
  assert.equal(radarUserWorkerPresence({ ...esgotado, now: AGORA }).state, "UNKNOWN");

  const aindaTenta = radarSummarizeUserWorkerQueue([linha("FAILED_RETRYABLE", { attempts: 2, maxAttempts: 3 })]);
  assert.equal(aindaTenta.queued, 1, "com tentativa sobrando, ainda é fila");

  /* Resíduo de batimento em linha não reivindicada não é sinal de vida. */
  const residuo = radarSummarizeUserWorkerQueue([
    linha("PENDING_LOCAL_PROCESSING", { heartbeatAt: haSegundos(5) }),
    linha("PROCESSING", { heartbeatAt: haSegundos(400) }),
  ]);
  assert.equal(residuo.lastHeartbeatAt, haSegundos(400), "o batimento lido é o do job em PROCESSING");
  assert.equal(radarUserWorkerPresence({ ...residuo, now: AGORA }).state, "WAITING_FOR_WORKER");

  /* Entre reivindicados, vence o mais recente. */
  const doisVivos = radarSummarizeUserWorkerQueue([
    linha("PROCESSING", { heartbeatAt: haSegundos(300) }),
    linha("PROCESSING", { heartbeatAt: haSegundos(20) }),
    linha("RECEIVED"),
  ]);
  assert.deepEqual(doisVivos, { queued: 1, processing: 2, lastHeartbeatAt: haSegundos(20) });
  assert.equal(radarUserWorkerPresence({ ...doisVivos, now: AGORA }).state, "CONNECTED");
});

test("USER_WORKER_1 · os estados contados como fila são os mesmos que o claim busca", () => {
  /*
   * A DIVERGÊNCIA SILENCIOSA ERA O RISCO REAL — e já tinha acontecido: a
   * primeira versão desta leitura filtrava por `"QUEUED"`, status que o CHECK
   * da tabela não admite. A tela teria dito "nenhum processamento pendente"
   * para sempre, com a fila cheia.
   */
  const sql = ler("supabase/migrations/20260825150000_telegram_expert_contribution_platform_foundation.sql");
  const claim = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.claim_external_processing_job"));
  assert.ok(claim.length > 0, "a função de claim existe na migration");
  const where = claim.match(/WHERE j\.status IN \(([^)]+)\)/);
  assert.ok(where, "o WHERE do claim foi encontrado");
  assert.deepEqual(
    where![1].split(",").map(item => item.trim().replace(/'/g, "")).sort(),
    [...RADAR_USER_WORKER_CLAIMABLE_STATUSES].sort(),
    "QUEUE_STATUSES_MATCH_CLAIM = YES",
  );

  /* E o CHECK da tabela admite cada um deles. */
  const check = sql.match(/status text NOT NULL DEFAULT 'PENDING_LOCAL_PROCESSING' CHECK \(status IN \(([^)]+)\)\)/);
  assert.ok(check, "o CHECK de status foi encontrado");
  const admitidos = new Set(check![1].split(",").map(item => item.trim().replace(/'/g, "")));
  for (const estado of [...RADAR_USER_WORKER_CLAIMABLE_STATUSES, "PROCESSING"]) {
    assert.ok(admitidos.has(estado), `o banco admite "${estado}"`);
  }
});

/* ==========  §9 · O FLUXO NÃO DEPENDE DO NAVEGADOR  ============== */

test("USER_WORKER_1 · o job vive no Supabase, então fechar o browser não o cancela", () => {
  const pagina = ler("modules/radar/radar-page.tsx");

  /*
   * A TELA REGISTRA INTENÇÃO; O SUPABASE GUARDA. Nenhum job existe em memória
   * do navegador, e nenhum caminho de fechamento cancela coisa alguma — é por
   * isso que F5 e fechar a aba são indiferentes ao processamento.
   */
  assert.equal(/beforeunload|unload|cancelJob|abortJob/.test(pagina), false, "nada é cancelado ao sair");
  assert.equal(/runLocalWorkerOnce|runLocalWorkerContinuously|claim_external_processing_job/.test(pagina), false, "USER_MACHINE_EXECUTES_JOBS = YES");

  /* E a fila continua sendo uma só. */
  const laco = ler("lib/server/local-worker/continuous.ts").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/\.from\(|\.rpc\(/.test(laco), false, "SECOND_QUEUE_CREATED = NO");
});

test("USER_WORKER_1 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS = 0 — ${tentativasDeRede.join(", ")}`);
});
