import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  localRecoveryNoticeAfterCanonicalRead,
  localRecoveryWarning,
  type LocalRecoveryNotice,
} from "../lib/editorial/local-recovery.ts";

/*
 * ===== RADAR_RECOVERY_WARNING_LIFECYCLE_1 · O AVISO QUE NUNCA SAÍA =====
 *
 * ==================== O DEFEITO ====================
 *
 * `pipeline.localRecoveryWarning` nascia numa falha da cópia de recuperação e
 * ficava. Nenhuma leitura canônica bem-sucedida o apagava; só duas operações
 * específicas o zeravam. O resultado é um aviso de trabalho não confirmado
 * ocupando o topo da tela do Radar muito depois de o servidor ter confirmado
 * tudo — e um aviso que nunca sai deixa de ser lido.
 *
 * ==================== POR QUE NÃO É "LEU, LIMPOU" ====================
 *
 * Os dois avisos são a mesma string e não são o mesmo fato:
 *
 *   remoteConfirmed = true    o servidor TEM o trabalho
 *   remoteConfirmed = false   o trabalho existe SÓ nesta aba
 *
 * Uma leitura do servidor responde o primeiro. Ela não responde o segundo — o
 * que nunca foi enviado não aparece na leitura —, e limpar esse aviso porque
 * "a leitura deu certo" esconderia risco de perda no momento exato em que a
 * pessoa ainda poderia agir.
 *
 * PROVIDER_CALLS = 0 e AI_CALLS = 0: este módulo é domínio puro.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const avisoConfirmado = (): LocalRecoveryNotice => ({
  message: localRecoveryWarning({
    operation: "A coleta real da SERP",
    reason: "o armazenamento local do navegador está cheio (quota excedida)",
    remoteConfirmed: true,
  }),
  remoteConfirmed: true,
});

const avisoSoNestaAba = (): LocalRecoveryNotice => ({
  message: localRecoveryWarning({
    operation: "A revisão da SERP",
    reason: "o armazenamento local do navegador está cheio (quota excedida)",
    remoteConfirmed: false,
  }),
  remoteConfirmed: false,
});

/* ================================= A ================================= */

test("A · aviso com confirmação remota sai depois de uma leitura canônica bem-sucedida", () => {
  const depois = localRecoveryNoticeAfterCanonicalRead(avisoConfirmado(), { ok: true, remoteConfirmed: true });
  assert.equal(depois, null, "o aviso já respondido continuou na tela");
});

test("A · e o texto dele dizia justamente que o servidor já tinha o trabalho", () => {
  /*
   * A frase importa: ela é a razão de este aviso poder sair.
   */
  assert.match(avisoConfirmado().message, /foi salva remotamente e não precisa ser refeita/);
  assert.match(avisoConfirmado().message, /Apenas a cópia de recuperação no navegador/);
});

/* ================================= B ================================= */

test("B · aviso sem confirmação remota PERMANECE, mesmo com a leitura bem-sucedida", () => {
  /*
   * ===== O CASO QUE PROÍBE A LIMPEZA CEGA =====
   *
   * A leitura do servidor deu certo, e isso não diz nada sobre um trabalho que
   * nunca foi enviado. Apagar aqui seria trocar um aviso incômodo por uma
   * perda silenciosa.
   */
  const depois = localRecoveryNoticeAfterCanonicalRead(avisoSoNestaAba(), { ok: true, remoteConfirmed: true });
  assert.deepEqual(depois, avisoSoNestaAba(), "o aviso de trabalho não sincronizado sumiu");
  assert.match(depois!.message, /não foi confirmada no servidor nem na cópia de recuperação/);
  assert.match(depois!.message, /Recarregar a página pode perdê-la/);
});

test("B · leitura que veio de recuperação local não confirma nada", () => {
  /*
   * `persisted.mode !== "server"` significa que a própria leitura é local. Ela
   * não pode ser usada como prova de que o servidor tem o trabalho.
   */
  const depois = localRecoveryNoticeAfterCanonicalRead(avisoConfirmado(), { ok: true, remoteConfirmed: false });
  assert.deepEqual(depois, avisoConfirmado(), "uma leitura local apagou o aviso");
});

test("B · leitura que falhou preserva os dois tipos de aviso", () => {
  assert.deepEqual(localRecoveryNoticeAfterCanonicalRead(avisoConfirmado(), { ok: false, remoteConfirmed: false }), avisoConfirmado());
  assert.deepEqual(localRecoveryNoticeAfterCanonicalRead(avisoSoNestaAba(), { ok: false, remoteConfirmed: false }), avisoSoNestaAba());

  /*
   * ===== E `ok: false` MANDA MAIS QUE `remoteConfirmed` =====
   *
   * Uma leitura que falhou não confirma nada, nem quando o chamador afirma o
   * contrário — a afirmação descreve o estado que ele ESPERAVA ler, não o que
   * leu. Sem este caso, trocar a condição por `if (!read.remoteConfirmed)`
   * passaria despercebido, e um erro de leitura apagaria o aviso.
   */
  assert.deepEqual(
    localRecoveryNoticeAfterCanonicalRead(avisoConfirmado(), { ok: false, remoteConfirmed: true }),
    avisoConfirmado(),
    "uma leitura que falhou apagou o aviso",
  );
});

/* ================================= C ================================= */

test("C · falha local nova reaparece depois de uma limpeza anterior", () => {
  /*
   * A limpeza não é um interruptor permanente: ela responde UM aviso. A
   * próxima falha nasce como qualquer outra.
   */
  const limpo = localRecoveryNoticeAfterCanonicalRead(avisoConfirmado(), { ok: true, remoteConfirmed: true });
  assert.equal(limpo, null);

  const novo = avisoSoNestaAba();
  assert.deepEqual(localRecoveryNoticeAfterCanonicalRead(novo, { ok: true, remoteConfirmed: true }), novo);

  /* E a ausência de aviso continua ausência — a regra não inventa aviso. */
  assert.equal(localRecoveryNoticeAfterCanonicalRead(null, { ok: true, remoteConfirmed: true }), null);
  assert.equal(localRecoveryNoticeAfterCanonicalRead(null, { ok: false, remoteConfirmed: false }), null);
});

/* ================================= D ================================= */

test("D · limpar o aviso não toca em dado local nenhum", async () => {
  const fonte = await readFile(new URL("../lib/editorial/local-recovery.ts", import.meta.url), "utf8");
  const regra = fonte.slice(fonte.indexOf("export function localRecoveryNoticeAfterCanonicalRead"));

  /*
   * A REGRA É PURA, e é isso que garante o §7 do gate.
   *
   * Ela recebe o aviso e devolve o aviso. Não conhece armazenamento, não
   * conhece rede e não tem como apagar snapshot, payload de recuperação ou
   * trabalho não sincronizado.
   */
  for (const proibido of ["localStorage", "sessionStorage", "removeItem", "clear(", "fetch(", "delete "]) {
    assert.equal(regra.includes(proibido), false, `a regra de ciclo de vida conhece ${proibido}`);
  }

  /* E o contexto não apaga armazenamento ao aplicar a regra. */
  const contexto = await readFile(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");
  const aplicacao = contexto.slice(
    contexto.indexOf("const avisoVigente = localRecoveryNoticeAfterCanonicalRead"),
    contexto.indexOf("localRecoveryRemoteConfirmed: avisoVigente?.remoteConfirmed"),
  );
  assert.ok(aplicacao.length > 0, "a aplicação da regra sumiu da leitura canônica");
  assert.equal(/removeItem|localStorage\.clear/.test(aplicacao), false, "a limpeza do aviso apagou armazenamento");

  /*
   * ===== CALCULAR NÃO É APLICAR =====
   *
   * Um resultado computado e descartado passa por qualquer teste que só
   * procure a chamada. O que precisa ser verdade é que o aviso EXIBIDO sai
   * dela — senão a regra vira decoração e o aviso fica para sempre.
   */
  assert.ok(contexto.includes("localRecoveryWarning: avisoVigente?.message ?? null"),
    "a leitura canônica calcula o aviso vigente e não o aplica");
  assert.ok(contexto.includes("localRecoveryRemoteConfirmed: avisoVigente?.remoteConfirmed ?? false"),
    "a origem do aviso deixou de acompanhar o aviso");
});

/* ================================= E ================================= */

test("E · a limpeza não provoca nenhuma chamada — nem ao Supabase, nem a provider", async () => {
  localRecoveryNoticeAfterCanonicalRead(avisoConfirmado(), { ok: true, remoteConfirmed: true });
  localRecoveryNoticeAfterCanonicalRead(avisoSoNestaAba(), { ok: true, remoteConfirmed: true });

  /*
   * A regra roda DENTRO do `updateWorkspace` da leitura que já aconteceu. Ela
   * não dispara leitura nova: se disparasse, cada limpeza custaria uma ida ao
   * banco para apagar um texto.
   */
  const contexto = await readFile(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");
  const aplicacao = contexto.slice(
    contexto.indexOf("const avisoVigente = localRecoveryNoticeAfterCanonicalRead"),
    contexto.indexOf("localRecoveryRemoteConfirmed: avisoVigente?.remoteConfirmed"),
  );
  assert.equal(/fetch\(|reload\(|reloadOperational\(/.test(aplicacao), false, "a limpeza passou a chamar o servidor");

  assert.deepEqual(idasAoServidor, [], `houve rede: ${idasAoServidor.join(" · ")}`);
});

/* ===================== o campo que separa os dois avisos ===================== */

test("§ · o contexto carimba a origem do aviso nos três lugares que o criam", async () => {
  const contexto = await readFile(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");

  /*
   * Sem o carimbo, os dois avisos voltam a ser a mesma string — e a limpeza
   * volta a ser cega.
   */
  assert.equal((contexto.match(/localRecoveryRemoteConfirmed:/g) || []).length >= 5, true,
    "algum criador de aviso deixou de declarar a origem");
  assert.match(contexto, /localRecoveryRemoteConfirmed: body\.persistenceMode === "remote"/,
    "a coleta da SERP deixou de declarar a confirmação remota real");
});
