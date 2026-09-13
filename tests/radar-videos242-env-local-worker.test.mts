import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isTenantId } from "../lib/tenant-routing.ts";

/*
 * ======  VÍDEOS · GATE 2.4.2 — O WORKER ENXERGA A CONFIGURAÇÃO  =======
 *
 * O 2.4.1 fez `pnpm run local-worker:once` dar boot. Ele então parou no passo
 * seguinte:
 *
 *   CanonicalAuthorizationError  REMOTE_UNAVAILABLE
 *   "A autorização canônica não está configurada no servidor."
 *
 * A CAUSA NÃO ERA A AUTORIZAÇÃO. Era que o Next carrega `.env.local` sozinho e
 * o `node` puro não carrega nada — então `NEXT_PUBLIC_SUPABASE_URL` e
 * `SUPABASE_SERVICE_ROLE_KEY` simplesmente não existiam no processo. A mesma
 * classe do 2.4.1: o worker roda fora do Next e paga por tudo que o Next fazia
 * de graça.
 *
 * DUAS COISAS QUE ESTE GATE FECHA:
 *
 *   1. o script carrega `.env` e `.env.local` pelo próprio Node, na ordem de
 *      precedência do Next — ninguém exporta segredo à mão;
 *   2. o que falta é dito ANTES de tentar, pelo NOME da variável, em vez de
 *      virar uma frase genérica vinda de dentro do cliente canônico.
 *
 * NENHUM SEGREDO É IMPRESSO — aqui nem no worker. Só nomes.
 * NENHUM BANCO, NENHUM PROVIDER: toda execução para numa guarda.
 */

const raiz = new URL("..", import.meta.url);
const pacote = JSON.parse(readFileSync(new URL("package.json", raiz), "utf8")) as { scripts: Record<string, string> };

/** O comando operacional como ele está declarado — não como eu lembro dele. */
const COMANDO = pacote.scripts["local-worker:once"];

/** Um UUID v4 de fixture. Não existe no banco, e nunca chega a ser consultado. */
const ATOR_VALIDO = "11111111-1111-4111-8111-111111111111";

/**
 * A COMBINAÇÃO QUE NENHUM TESTE PODE EXECUTAR.
 *
 * Configuração canônica REAL + ator de forma válida passa de todas as guardas
 * por definição: o processo segue para o cliente de serviço e para o CLAIM, num
 * banco de verdade, com o job do USER esperando na fila. Uma versão anterior
 * deste arquivo fez exatamente isso — e um teste não pode ser a coisa que
 * reivindica o trabalho de quem está operando.
 *
 * O guarda vive aqui, no arranque, e não numa lembrança de quem escrever o
 * próximo teste.
 */
function rodar(ambiente: Record<string, string>) {
  const configuracaoReal = (ambiente.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") !== ""
    && (ambiente.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "") !== "";
  if (ambiente.LOCAL_WORKER_RUN === "1" && configuracaoReal && isTenantId(ambiente.LOCAL_WORKER_ACTOR_USER_ID || "")) {
    throw new Error("ESTE TESTE CHEGARIA AO CLAIM NO BANCO REAL: zere a configuração canônica ou use um ator inválido.");
  }

  const [executavel, ...argumentos] = COMANDO.split(/\s+/);
  try {
    const saida = execFileSync(executavel, argumentos, {
      cwd: new URL(".", raiz).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
      encoding: "utf8",
      env: { ...process.env, LOCAL_WORKER_RUN: "", LOCAL_WORKER_ACTOR_USER_ID: "", ...ambiente },
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true as const, saida };
  } catch (erro) {
    const falha = erro as { stdout?: string; stderr?: string };
    return { ok: false as const, saida: `${falha.stdout || ""}${falha.stderr || ""}` };
  }
}

/* ==========  A e B · O PROCESSO ENXERGA A CONFIGURAÇÃO  ========= */

test("VÍDEOS 2.4.2 · A e B — o script carrega a env server-side sem export manual", () => {
  /*
   * A PROVA É INDIRETA E DECISIVA: pedimos para RODAR com um ator inválido.
   *
   * Se a configuração canônica não estivesse visível, a recusa seria
   * `LOCAL_WORKER_CONFIG_REQUIRED` — ela vem ANTES da checagem do ator. Chegar
   * à recusa do ATOR significa que as duas variáveis foram encontradas.
   *
   * E nada de segredo é impresso: o teste lê o NOME da guarda, não o valor.
   */
  const resultado = rodar({ LOCAL_WORKER_RUN: "1", LOCAL_WORKER_ACTOR_USER_ID: "" });

  assert.ok(resultado.ok, `o comando saiu com erro:\n${resultado.saida}`);
  assert.ok(
    !resultado.saida.includes("LOCAL_WORKER_CONFIG_REQUIRED"),
    `a configuração server-side não chegou ao worker:\n${resultado.saida}`,
  );
  assert.match(resultado.saida, /LOCAL_WORKER_ACTOR_USER_ID_REQUIRED/);

  /*
   * E O MECANISMO É O QUE O PROJETO JÁ USA.
   *
   * Sete scripts operacionais deste repositório — os `audit:*` e o
   * `reset:arquiteto` — já carregam `.env.local` com esta mesma bandeira do
   * Node. Não faltava ferramenta: faltava a bandeira NESTE script. Inventar
   * uma variante (dotenv, ou uma ordem de arquivos própria) criaria uma
   * segunda convenção para o mesmo problema já resolvido.
   */
  assert.match(COMANDO, /--env-file-if-exists=\.env\.local/);
  assert.ok(!COMANDO.includes(".env.example"), "o arquivo de exemplo nunca é carregado");
  assert.ok(!COMANDO.includes(".env.production"), "nenhum arquivo de produção é carregado");
  assert.ok(!COMANDO.includes("dotenv"), "nenhuma dependência nova para algo que o Node faz");

  const scripts = JSON.parse(readFileSync(new URL("package.json", raiz), "utf8")).scripts as Record<string, string>;
  const irmaos = Object.entries(scripts).filter(([nome]) => nome !== "local-worker:once" && scripts[nome].includes("--env-file-if-exists"));
  assert.ok(irmaos.length >= 5, "a convenção já existia em vários scripts");
  for (const [nome, comando] of irmaos) {
    assert.match(comando, /--env-file-if-exists=\.env\.local/, `${nome} usa a mesma convenção`);
  }
});

test("VÍDEOS 2.4.2 · B — o ambiente do shell continua vencendo o arquivo", () => {
  /*
   * `--env-file` do Node não sobrescreve variável já presente no ambiente — e
   * é disso que depende poder apontar o worker para outro projeto sem editar
   * arquivo nenhum. É também o que permite a este teste neutralizar a
   * configuração real sem tocar em `.env.local`.
   */
  const resultado = rodar({
    LOCAL_WORKER_RUN: "1",
    LOCAL_WORKER_ACTOR_USER_ID: ATOR_VALIDO,
    NEXT_PUBLIC_SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
  });
  assert.match(resultado.saida, /LOCAL_WORKER_CONFIG_REQUIRED/, "o ambiente sobrepôs o arquivo");
});

/* ==========  C · SEM CONFIGURAÇÃO, FALHA CEDO E CLARA  ========== */

test("VÍDEOS 2.4.2 · C — sem a env canônica, a recusa nomeia o que falta", () => {
  const semNada = rodar({
    LOCAL_WORKER_RUN: "1",
    LOCAL_WORKER_ACTOR_USER_ID: ATOR_VALIDO,
    NEXT_PUBLIC_SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
  });

  assert.ok(semNada.ok, `a recusa não pode derrubar o processo:\n${semNada.saida}`);
  assert.match(semNada.saida, /LOCAL_WORKER_CONFIG_REQUIRED: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(semNada.saida, /nenhum job foi executado/);

  /*
   * E NÃO É MAIS A FRASE GENÉRICA DE DENTRO DO CLIENTE CANÔNICO.
   *
   * "A autorização canônica não está configurada no servidor" é verdadeira e
   * inútil: ela não diz o que configurar, e foi por isso que o smoke parou sem
   * saber o próximo passo.
   */
  assert.ok(!semNada.saida.includes("REMOTE_UNAVAILABLE"), "a falha não vem mais de dentro do cliente");
  assert.ok(!semNada.saida.includes("CanonicalAuthorizationError"), "nem como exceção não tratada");

  /* Uma só ausente também é nomeada — e só ela. */
  const soAChave = rodar({ LOCAL_WORKER_RUN: "1", LOCAL_WORKER_ACTOR_USER_ID: ATOR_VALIDO, SUPABASE_SERVICE_ROLE_KEY: "" });
  assert.match(soAChave.saida, /LOCAL_WORKER_CONFIG_REQUIRED: SUPABASE_SERVICE_ROLE_KEY;/);
  assert.ok(!soAChave.saida.includes("NEXT_PUBLIC_SUPABASE_URL"), "a que está presente não é acusada");
});

/* ==========  D · O ATOR PLACEHOLDER É RECUSADO  ================= */

test("VÍDEOS 2.4.2 · D — placeholder de ator é recusado antes do claim", () => {
  /*
   * O VALOR LITERAL DO SMOKE. Ele não é UUID, e o worker o levaria até o claim
   * para falhar lá como se fosse problema de autorização — escondendo que o
   * erro era de operação.
   */
  const placeholder = rodar({ LOCAL_WORKER_RUN: "1", LOCAL_WORKER_ACTOR_USER_ID: "SEU_AUTH_USER_ID" });
  assert.ok(placeholder.ok);
  assert.match(placeholder.saida, /LOCAL_WORKER_ACTOR_USER_ID_REQUIRED/);
  assert.match(placeholder.saida, /não é um UUID válido \(parece um placeholder\)/);
  assert.match(placeholder.saida, /nenhum job foi executado/);

  /* Ausente é outra recusa, com outra frase: as duas causas são distinguíveis. */
  const ausente = rodar({ LOCAL_WORKER_RUN: "1", LOCAL_WORKER_ACTOR_USER_ID: "" });
  assert.match(ausente.saida, /LOCAL_WORKER_ACTOR_USER_ID não configurado/);

  /*
   * E UM UUID DE FORMA VÁLIDA PASSA DA GUARDA — provado SEM subprocesso.
   *
   * A primeira versão disto rodava o comando real com um UUID válido e a
   * configuração real carregada. Isso passa das guardas por definição: o
   * processo seguiria para `createCanonicalServiceClient` e para o CLAIM, num
   * banco de verdade, com um job de verdade esperando na fila. Um teste não
   * pode ser a coisa que reivindica o job do usuário.
   *
   * A guarda trata só de FORMA, e forma se confere sem processo nenhum.
   */
  assert.equal(isTenantId(ATOR_VALIDO), true, "UUID válido não é recusado pela forma");
  assert.equal(isTenantId("SEU_AUTH_USER_ID"), false);
  assert.equal(isTenantId(""), false);
});

test("VÍDEOS 2.4.2 · D — o ator é declarado, nunca adivinhado", () => {
  const fonte = readFileSync(new URL("scripts/local-worker.mts", raiz), "utf8");

  /*
   * NADA DE ESCOLHER UM USUÁRIO SOZINHO — §6. Pegar o primeiro do banco, o
   * dono, ou o mais recente transformaria um erro de operação numa ação
   * atribuída a alguém que não a pediu.
   */
  for (const proibido of ["auth.users", "listUsers", "order(", "limit(1)", "owner_user_id", ".single()"]) {
    assert.ok(!fonte.includes(proibido), `o ator não é derivado de "${proibido}"`);
  }
  assert.match(fonte, /process\.env\.LOCAL_WORKER_ACTOR_USER_ID/);
  /* A validação usa a autoridade de UUID que o projeto já tem. */
  assert.match(fonte, /import \{ isTenantId \} from "\.\.\/lib\/tenant-routing"/);
  assert.match(fonte, /if \(!isTenantId\(valor\)\) return/);
});

/* ==========  E e F · NEM PROVIDER, NEM BANCO  =================== */

test("VÍDEOS 2.4.2 · E e F — nenhuma guarda chega ao cliente, ao banco ou a provider", () => {
  const fonte = readFileSync(new URL("scripts/local-worker.mts", raiz), "utf8");

  /*
   * A ORDEM É O CONTRATO: as três recusas vêm todas ANTES da construção do
   * cliente de serviço. É isso que permite exercer o comando real num teste
   * sem tocar banco nem provider — e por isso não foi preciso inventar um
   * segundo entrypoint "de teste".
   */
  const clienteEm = fonte.indexOf("createCanonicalServiceClient()");
  assert.ok(clienteEm > 0, "o cliente de serviço existe no entrypoint");
  for (const guarda of ['LOCAL_WORKER_RUN !== "1"', "if (faltando.length)", "else if (problemaDoAtor)"]) {
    /*
     * A PRESENÇA VEM ANTES DA ORDEM.
     *
     * `indexOf` devolve -1 para o que não existe, e `-1 < clienteEm` é
     * verdadeiro: apagar a guarda faria esta asserção passar exatamente como
     * se ela estivesse no lugar certo. Já caí nisso neste projeto.
     */
    const posicao = fonte.indexOf(guarda);
    assert.ok(posicao >= 0, `a guarda "${guarda}" existe`);
    assert.ok(posicao < clienteEm, `a guarda "${guarda}" precede o cliente`);
  }
  /* E o claim vem depois de tudo isso. */
  const claimEm = fonte.indexOf("runLocalWorkerOnce(");
  assert.ok(claimEm > 0, "o claim existe");
  assert.ok(clienteEm < claimEm);

  /*
   * NENHUM SEGREDO IMPRESSO. O worker fala de NOMES de variáveis; imprimir o
   * valor de `SUPABASE_SERVICE_ROLE_KEY` num log operacional seria vazá-lo
   * para qualquer terminal, histórico de shell ou captura de tela.
   */
  for (const linha of fonte.match(/console\.log\([^\n]*\)/g) || []) {
    assert.ok(!/process\.env\[[^\]]*\]|process\.env\.[A-Z_]+/.test(linha), `um console.log imprime env: ${linha}`);
  }
  assert.match(fonte, /\["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"\]\.filter\(nome => !process\.env\[nome\]\?\.trim\(\)\)/);
});

/* ==========  A FILA CONTINUA INTOCADA  ========================= */

test("VÍDEOS 2.4.2 · o job existente continua reivindicável", () => {
  /*
   * ESTE GATE É DE CONFIGURAÇÃO. Nada aqui toca a fila, o claim, o lease ou o
   * retry — o job que o USER já criou continua esperando o mesmo caminho.
   */
  const runner = readFileSync(new URL("lib/server/local-worker/runner.ts", raiz), "utf8");
  assert.match(runner, /claim_external_processing_job/);
  assert.ok(!runner.includes("job_kind ="), "o claim não passou a filtrar por tipo");

  const fonte = readFileSync(new URL("scripts/local-worker.mts", raiz), "utf8");
  assert.match(fonte, /job\.job_kind === "radar_video_text_acquisition" \? video\(job\) : especialista\(job\)/);
  assert.equal((fonte.match(/runLocalWorkerOnce\(/g) || []).length, 1, "um runner só");
});
