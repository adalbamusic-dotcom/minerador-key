import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { persistenceReasonFromError, persistenceUnavailableMessage } from "../lib/radar/persistence.ts";

/*
 * ===== RADAR_TO_WRITER_NO_ANALYSIS_APPEND_1 · A ESCRITA QUE NÃO PRECISAVA EXISTIR =====
 *
 * ==================== O QUE ESTE GATE FECHA ====================
 *
 * Provado por log, em runtime real:
 *
 *   [persistence] "connection_unavailable" "57014"
 *                 "canceling statement due to statement timeout"
 *                 at WorkflowRepository.appendRadarAnalysis
 *
 * Duas coisas erradas, uma em cima da outra.
 *
 * A primeira: entregar um Radar JÁ FINALIZADO gravava uma VERSÃO NOVA DA
 * ANÁLISE. A linha do Radar tem ~9,77 MB medidos — número que o próprio
 * `editorial-repositories.ts` registra —, e acrescentar mais um item obrigava a
 * reescrever o payload inteiro. O Postgres cancelou com 57014.
 *
 * Handoff é CONSUMO de estado congelado. Ele não investiga, não analisa e não
 * finaliza; não tinha por que escrever no histórico da investigação.
 *
 * A segunda: `canceling statement due to statement timeout` contém "timeout" e
 * caía na regra de rede, virando "não foi possível conectar ao Supabase". A
 * conexão funcionou perfeitamente — ela devolveu o erro. Uma mensagem que
 * descreve a causa errada é pior que uma genérica, porque dirige o diagnóstico
 * para o lugar errado com confiança.
 *
 * PROVIDER_CALLS = 0 e AI_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const envio = await readFile(new URL("../lib/server/radar-writer-send.ts", import.meta.url), "utf8");
const semComentarios = envio.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const repositorios = await readFile(new URL("../lib/server/editorial-repositories.ts", import.meta.url), "utf8");
const cliente = await readFile(new URL("../lib/radar/writer-handoff-client.ts", import.meta.url), "utf8");

/* ================================= B ================================= */

test("B · o envio ao Redator não tem como criar versão de análise", () => {
  /*
   * A PORTA NÃO EXISTE MAIS NO CONTRATO.
   *
   * Tirar a chamada e deixar a porta seria um convite: o próximo gate que
   * precisasse "só gravar uma coisinha" a usaria de novo, e a linha de 9,77 MB
   * voltaria a ser reescrita.
   */
  assert.equal(/appendAnalysis|appendRadarAnalysis|createRadarAnalysisSuccessor/.test(semComentarios), false,
    "o serviço de entrega voltou a poder escrever no histórico da análise");

  /* E o tipo das portas também não a declara. */
  const portas = envio.slice(envio.indexOf("export type RadarWriterHandoffPorts"), envio.indexOf("export const radarWriterHandoffPorts"));
  assert.equal(/appendAnalysis/.test(portas), false, "a porta de append voltou ao contrato");
});

/* ================================= C ================================= */

test("C · a esteira se move gravando só a coluna de estado", () => {
  /*
   * ===== A SEGUNDA ESCRITA GRANDE, QUE QUASE PASSOU =====
   *
   * `transition` manda o payload de volta na mesma instrução. Para esta linha
   * isso é subir ~9,77 MB para trocar uma palavra — o mesmo timeout, por outro
   * caminho. Corrigir só o append teria deixado o bug vivo.
   */
  assert.match(repositorios, /async transitionState\(id: string, expectedLock: number, state: string, actorId: string\)/);
  const metodo = repositorios.slice(repositorios.indexOf("async transitionState("), repositorios.indexOf("async transition(id"));
  assert.match(metodo, /\.update\(\{ state, updated_by: actorId \}\)/, "a transição enxuta voltou a mandar payload");
  assert.equal(/payload/.test(metodo.replace(/\/\*[\s\S]*?\*\//g, " ")), false, "payload voltou para a transição enxuta");

  /* E é ela que o envio usa. */
  assert.match(semComentarios, /transitionState\(id, expectedLock, "sent_writer", actorId\)/);
  assert.equal(/WorkflowRepository\(\)\.transition\(/.test(semComentarios), false,
    "o envio voltou a usar a transição que reescreve o payload");
});

test("§4 · as garantias do pacote sobreviveram à remoção da escrita", () => {
  /*
   * ===== POR QUE ESTE TESTE É ESTRUTURAL, E NÃO DE COMPORTAMENTO =====
   *
   * Integridade e vínculo eram conferidos no RECIBO RELIDO. Sem a escrita não
   * há releitura, e passaram a ser conferidos sobre o pacote resolvido.
   *
   * Não dá para exercitá-los por comportamento a partir daqui: quem monta o
   * pacote é `resolveRadarCanonicalDossier`, com o mesmo `article` que a
   * conferência usa — por construção ele nunca sai inconsistente. Os dois
   * existem para o dia em que o pacote vier de outro lugar, e é justamente por
   * serem inalcançáveis hoje que alguém os apagaria sem ver teste vermelho.
   *
   * Então o que este teste guarda é a PRESENÇA e a ORDEM: antes de criar o
   * documento, nunca depois.
   */
  assert.ok(semComentarios.includes("assertRadarEvidenceBundleIntegrity(bundle as RadarEvidenceBundle)"),
    "a integridade do pacote deixou de ser conferida na entrega");
  assert.ok(semComentarios.includes("radarEvidenceBundleMatchesArticle(bundle as RadarEvidenceBundle, article)"),
    "o vínculo com o ArticleDNA deixou de ser conferido na entrega");
  assert.match(semComentarios, /radar_handoff_binding_mismatch/);

  const integridade = semComentarios.indexOf("assertRadarEvidenceBundleIntegrity(bundle");
  const vinculo = semComentarios.indexOf("radarEvidenceBundleMatchesArticle(bundle");
  const criacao = semComentarios.indexOf("portas.createDocument(");
  assert.ok(integridade > 0 && vinculo > integridade, "o vínculo deixou de ser conferido depois da integridade");
  assert.ok(criacao > vinculo, "o documento passou a nascer antes das conferências do pacote");

  /* E a revalidação do fundamento corrente continua antes de tudo isso. */
  const stale = semComentarios.indexOf("radar_handoff_blocked_stale");
  assert.ok(stale > 0 && stale < criacao, "o ArticleDNA deixou de ser revalidado antes da entrega");
});

/* ================================= K ================================= */

test("K · o lote não tem caminho próprio — ele repete a mesma porta", () => {
  /*
   * Se o lote tivesse caminho próprio, corrigir o individual deixaria trinta
   * artigos ainda reescrevendo 9,77 MB cada.
   */
  assert.match(cliente, /resultados\.push\(await postRadarWriterHandoff\(/);
  const semComentariosDoCliente = cliente.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  const rotas = [...semComentariosDoCliente.matchAll(/"\/api\/[^"]+"/g)].map(item => item[0]);
  assert.deepEqual([...new Set(rotas)], ["\"/api/editorial/radar-writer-handoff\""]);
});

/* ================================= M ================================= */

test("M · Postgres 57014 é statement_timeout, e a mensagem diz a verdade", () => {
  /*
   * ===== A CLASSIFICAÇÃO QUE CUSTOU UMA INVESTIGAÇÃO INTEIRA =====
   *
   * Enquanto 57014 dizia "não foi possível conectar", a busca foi atrás de
   * rede, env e disponibilidade do projeto. Nada batia, porque a conexão nunca
   * esteve em causa.
   */
  assert.equal(persistenceReasonFromError("57014", "canceling statement due to statement timeout"), "statement_timeout");

  /* E também quando só a mensagem chega, sem código. */
  assert.equal(persistenceReasonFromError("", "canceling statement due to statement timeout"), "statement_timeout");

  const frase = persistenceUnavailableMessage("statement_timeout");
  assert.match(frase, /excedeu o tempo limite/);
  assert.match(frase, /A conexão está de pé/);
  assert.equal(/não foi possível conectar/i.test(frase), false, "a mensagem do timeout voltou a culpar a conexão");
});

/* ================================= N ================================= */

test("N · falha real de conexão continua sendo connection_unavailable", () => {
  /*
   * NÃO AFROUXAR A OUTRA PONTA.
   *
   * Reclassificar o timeout não pode transformar uma queda de rede em
   * "consulta demorada" — a pessoa precisa saber qual das duas é.
   */
  for (const mensagem of ["fetch failed", "network error", "ECONNREFUSED", "connection closed"]) {
    assert.equal(persistenceReasonFromError("", mensagem), "connection_unavailable", `"${mensagem}" deixou de ser conexão`);
  }

  /* E a tabela ausente continua sendo migration, não timeout. */
  assert.equal(persistenceReasonFromError("PGRST205", "Could not find the table 'public.brand_invitations' in the schema cache"), "migration_missing");
  assert.equal(persistenceReasonFromError("42P01", "relation \"x\" does not exist"), "migration_missing");

  /* E o que não se encaixa continua genérico, em vez de virar timeout. */
  assert.equal(persistenceReasonFromError("23505", "duplicate key value violates unique constraint"), "repository_unavailable");
});

test("N · a ordem importa: o específico é testado antes do amplo", async () => {
  /*
   * A regra de rede casa /timeout/i e engoliria o statement timeout se viesse
   * primeiro. A ordem é a correção — e é ela que um refactor distraído
   * desfaria.
   */
  const fonte = await readFile(new URL("../lib/radar/persistence.ts", import.meta.url), "utf8");
  const posicaoStatement = fonte.indexOf("statement_timeout\";");
  const posicaoConexao = fonte.indexOf("connection_unavailable\";", fonte.indexOf("export function persistenceReasonFromError"));
  assert.ok(posicaoStatement > 0 && posicaoConexao > 0, "as duas regras precisam existir");
  assert.ok(posicaoStatement < posicaoConexao, "a regra de rede voltou a vir antes do statement timeout");
});

/* ============================== a sentinela ============================== */

test("O · PROVIDER_CALLS = 0 · AI_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, [], `houve rede: ${idasAoServidor.join(" · ")}`);
});
