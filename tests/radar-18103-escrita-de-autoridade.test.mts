import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * ======  RADAR · HOTFIX 18.10.3 — A ESCRITA DE AUTORIDADE  =============
 *
 * Tudo o que era caro já funciona: SERP, pesquisa, extração, plano de fontes,
 * verificação, modelos derivados. O que não acontece é UMA coisa: a sucessora
 * final não chega ao banco. Depois de cada "Concluir análise" a tela mostra
 * relatório e modelo, e o banco continua na v24 com `analysisCompletedAt` nulo.
 *
 * A CAUSA ESTRUTURAL, na fonte: `saveRadarAnalysis` tem um caminho de fallback
 * local — legítimo para escritas best-effort — e ele engolia TAMBÉM a escrita
 * que carrega o carimbo. Um 409 de lock, um 400 de schema e um 503 produziam a
 * mesma coisa: estado local com cara de progresso.
 *
 * Este hotfix não cria domínio nem lifecycle. Ele faz duas coisas:
 *
 *   1. a escrita de autoridade perde a rede de segurança e mostra o erro real;
 *   2. ela declara o lock LIDO AGORA do banco, não o que o render capturou.
 *
 * Cinco testes, os mínimos que protegem isto. Mutação ampla fica para depois do
 * runtime verde.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE HOTFIX"));
  },
  writable: true, configurable: true,
});

const pagina = () => readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
const contexto = () => readFileSync(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");

function trecho(fonte: string, de: string, ate: string): string {
  const inicio = fonte.indexOf(de);
  assert.notEqual(inicio, -1, `âncora inicial ausente: ${de}`);
  const fim = fonte.indexOf(ate, inicio + de.length);
  assert.notEqual(fim, -1, `âncora final ausente: ${ate}`);
  return fonte.slice(inicio, fim);
}

/* ==========  1 · A RETOMADA NÃO RELÊ PÁGINA  ======================== */

test("18.10.3 · 1 — retomada sobre a v24 remota não extrai página nenhuma", () => {
  const corpo = trecho(pagina(), "const analyzeSerpSelection = async", "const reviewSerpForArticle = async");

  assert.match(corpo, /let fila = retomandoConsolidacao \? \[\] : \[\.\.\.candidates\];/, "PAGE_EXTRACTION_CALLS = 0");
  assert.match(corpo, /const paginasDoModelo = retomandoConsolidacao \? paginasDaAmostra : pages;/);
  assert.equal(/collectSerp\(|collectAuxiliarySerp|dataforseo/i.test(corpo), false, "SERP_CALLS = 0");
});

/* ==========  2 · O LOCK VEM DA LEITURA DESTA OPERAÇÃO  ============== */

test("18.10.3 · 2 — a escrita declara o lock lido agora, não o do render", () => {
  const corpo = trecho(pagina(), "const analyzeSerpSelection = async", "const reviewSerpForArticle = async");

  /* A leitura remota entrega o lock, e ele viaja até a escrita. */
  assert.match(corpo, /lockRemoto = remoto\.lockVersion;/);
  assert.match(corpo, /\.\.\.\(typeof lockRemoto === "number" \? \{ expectedLock: lockRemoto \} : \{\}\)/);

  /*
   * E o contexto prefere o lock recebido a qualquer palpite local.
   *
   * `currentItem` vem do render e o ref guarda o último save DESTA aba; entre
   * um e outro cabe a escrita da amostra da própria rodada, e é aí que o 409
   * nasce sem outra sessão existir.
   */
  const ctx = contexto();
  assert.match(ctx, /const expectedLock = typeof options\?\.expectedLock === "number"\s*\r?\n\s*\? options\.expectedLock/);
  assert.match(ctx, /: typeof lockConfirmado === "number" \? lockConfirmado : currentItem\.lockVersion;/, "o caminho antigo continua para as demais escritas");
});

/* ==========  3 · O ERRO REMOTO NÃO VIRA SUCESSO LOCAL  ============== */

test("18.10.3 · 3 — escrita de autoridade mostra o erro real e não cai no fallback", () => {
  const ctx = contexto();

  /* Status, código e corpo viajam juntos — e vão ao console. */
  assert.match(ctx, /const detalheRemoto = `HTTP \$\{response\.status\}\$\{typeof body\.code === "string" \? ` · \$\{body\.code\}` : ""\}`;/);
  assert.match(ctx, /console\.error\("\[radar:save-analysis\]", detalheRemoto/);
  assert.match(ctx, /if \(options\?\.requireRemote\) \{\s*\r?\n\s*throw Object\.assign\(new Error\(\[`A análise não foi gravada no servidor \(\$\{detalheRemoto\}\)\.`/);
  assert.match(ctx, /status: response\.status, code: typeof body\.code === "string" \? body\.code : null, remote: true,/);

  /*
   * E NEM O CATCH NEM O 503 VIRAM PROGRESSO.
   *
   * A heurística `/fetch|Failed|Network|503/` existe para o caminho
   * best-effort. Aplicada à escrita do carimbo, ela era exatamente o que
   * mantinha o banco na v24 com a tela mostrando relatório pronto.
   */
  const guarda = trecho(ctx, "      } catch (error) {", "if (error instanceof Error && !/fetch|Failed|Network|503/i.test(error.message)) throw error;");
  assert.match(guarda, /if \(options\?\.requireRemote\) \{/);
  assert.match(guarda, /throw error;/);
  assert.match(ctx, /a persistência remota está indisponível \(HTTP 503\)\. Nada foi aplicado como concluído\./);

  /* A escrita final da análise é a que pede isso. */
  const corpo = trecho(pagina(), "const analyzeSerpSelection = async", "const reviewSerpForArticle = async");
  assert.match(corpo, /await pipeline\.saveRadarAnalysis\(target\.articleId, next, \{\s*\r?\n\s*requireRemote: true,/);
  assert.equal(/await persistSerpAnalysis\(target\.articleId, next,/.test(corpo), false, "a escrita do carimbo não usa mais o caminho best-effort");
});

/* ==========  4 · SÓ COM READBACK A ANÁLISE É CONFIRMADA  =========== */

test("18.10.3 · 4 — write + readback continuam sendo a única porta para ANALYZED", () => {
  const ctx = contexto();

  assert.match(ctx, /if \(!readbackResponse\.ok\) throw new Error\(/);
  assert.match(ctx, /readbackBody\.persistenceMode !== "remote" \|\| readbackBody\.readbackConfirmed !== true/);
  assert.match(ctx, /não corresponde ao snapshot selecionado/);
  assert.match(ctx, /return \{ persistenceMode: "remote" as const, readbackConfirmed: true, unconfirmedClaims: \[\] as readonly string\[\] \};/);

  /* E o fallback, quando permitido, continua sem carregar o carimbo. */
  assert.match(ctx, /const semAutoridade = radarStripUnconfirmedClaims\(parsed\.payload\);/);

  /* A tela só declara sucesso com os dois confirmados. */
  const corpo = trecho(pagina(), "const analyzeSerpSelection = async", "const reviewSerpForArticle = async");
  assert.match(corpo, /salvo\.persistenceMode === "remote" && salvo\.readbackConfirmed\s*\r?\n?\s*\? "Persistência remota e readback confirmados\."/);
});

/* ==========  5 · O localStorage FORA DO CAMINHO CRÍTICO  =========== */

test("18.10.3 · 5 — quota cheia não altera o resultado remoto", () => {
  const ctx = contexto();

  /*
   * O caminho remoto bem-sucedido retorna ANTES de qualquer toque no cache — e
   * o `localRecoveryWarning: null` do sucesso é o que apaga um aviso velho.
   */
  const sucessoRemoto = trecho(ctx, "const persistedAnalysis = VersionedRadarAnalysisSchema.parse(readbackBody.analysis);", "return { persistenceMode: \"remote\" as const");
  assert.equal(/saveLocalRadarAnalysisRecovery/.test(sucessoRemoto), false, "LOCALSTORAGE_AFFECTED_REMOTE_WRITE = NO");
  assert.match(sucessoRemoto, /localRecoveryWarning: null/);

  /* E a falha do cache nunca é condição de nada. */
  assert.equal(/!saveLocalRadarAnalysisRecovery\(/.test(ctx), false);
  assert.equal(/localStorage\.removeItem|localStorage\.clear/.test(ctx), false);

  /* A leitura remota também não escreve no cache. */
  const leitura = trecho(ctx, "readRemoteRadarAnalyses: async (articleId) => {", "reviewSerp: async (articleId");
  assert.equal(/saveLocalRadarAnalysisRecovery|updateWorkspace/.test(leitura), false);
});

test("18.10.3 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS = 0 — ${tentativasDeRede.join(", ")}`);
});
