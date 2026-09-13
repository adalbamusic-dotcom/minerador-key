import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  RADAR_REMOTE_ONLY_CLAIMS, radarStripUnconfirmedClaims, radarUnconfirmedClaimsNotice,
} from "../lib/radar/remote-authority.ts";
import { radarPhase1Action } from "../lib/radar/serp-phase1.ts";
import { radarActionOutcome } from "../lib/radar/operational-actions.ts";

/*
 * ======  RADAR · GATE 18.10 — A AUTORIDADE É O SERVIDOR  ===============
 *
 * O smoke mostrou a tela dizendo duas coisas contraditórias ao mesmo tempo:
 *
 *   "Pesquisa = Finalizado · Investigação congelada · bundle b619b587"
 *   "A investigação NÃO foi finalizada: a gravação remota não pôde ser
 *    confirmada por readback."
 *
 * O handler de finalização estava CORRETO — ele só declara sucesso com
 * readback confirmado, e foi ele quem escreveu a segunda frase. Quem produziu
 * a primeira foi a camada abaixo.
 *
 * A CADEIA, RASTREADA NA FONTE:
 *
 *   finalizeInvestigation
 *     → createRadarAnalysisSuccessor(..., { finalizedBundle })
 *     → pipeline.saveRadarAnalysis(next)
 *         → POST falha (ou readback falha com mensagem de rede/503)
 *         → catch engole                              ← por desenho: fallback
 *         → updateWorkspace(radarItems ← nextItem)    ← O DEFEITO
 *           `nextItem` carrega o `finalizedBundle` inteiro
 *         → return { persistenceMode: "local", readbackConfirmed: false }
 *     → radarActionOutcome diz FAILED e a tela avisa
 *
 * As duas frases, do mesmo clique. A tela lia o bundle do estado LOCAL e
 * renderizava "Finalizado"; o F5 desmascarou porque o banco não o tinha.
 *
 * A MESMA CADEIA EXPLICA A METADE DO ANALYZE: a segunda escrita (a que leva
 * `analysisCompletedAt`) também caiu no fallback, ficou local, destravou o
 * FINALIZE, e sumiu no F5 — deixando a planilha em "gravação final da análise
 * não foi confirmada".
 *
 * A DISTINÇÃO QUE FALTAVA: o fallback local existe para não perder TRABALHO.
 * Ele nunca deveria carregar AFIRMAÇÕES sobre o que o servidor aceitou.
 *
 * O QUE ESTE GATE PROVA:
 *   A   write sem readback ⇒ nunca FINALIZED
 *   B   readback divergente ⇒ nunca FINALIZED
 *   C   write + readback confirmados ⇒ FINALIZED
 *   D   o bundle não entra no estado local antes de C
 *   E   a mesma autoridade alimenta card, detalhe e planilha
 *   F/G o F5 é a prova: estado local sem carimbo = estado remoto
 *   J   quota excedida não bloqueia o ciclo remoto
 *   K/L nenhum provider e nenhuma extração nascem deste caminho
 *   M   a mensagem não afirma etapa que o remoto não confirma
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    const alvo = typeof entrada === "string" ? entrada : String((entrada as { url?: string })?.url || entrada);
    tentativasDeRede.push(alvo);
    return Promise.reject(new Error(`REDE PROIBIDA NESTE GATE: ${alvo}`));
  },
  writable: true, configurable: true,
});

const contextoDoPipeline = () => readFileSync(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");
const pagina = () => readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

function trecho(fonte: string, de: string, ate: string): string {
  const inicio = fonte.indexOf(de);
  assert.notEqual(inicio, -1, `âncora inicial ausente: ${de}`);
  const fim = fonte.indexOf(ate, inicio + de.length);
  assert.notEqual(fim, -1, `âncora final ausente: ${ate}`);
  return fonte.slice(inicio, fim);
}

/** O payload do smoke: análise carimbada e investigação congelada. */
const payloadFinalizado = () => ({
  extractions: [{ id: "p1" }, { id: "p2" }],
  benchmark: { validPageCount: 11 },
  competitiveReport: { observedCompetitiveModel: {} },
  verifiedSources: [{ id: "s1" }],
  analysisCompletedAt: "2026-09-11T14:00:00.000Z",
  finalizedBundle: { bundleId: "b619b587", bundleHash: "2ed2b877" },
});

/* ==========  A, B e D · O QUE O FALLBACK PODE CARREGAR  =============== */

test("RADAR 18.10 · A e D — sem readback, o bundle não entra no estado local", () => {
  const { payload, stripped } = radarStripUnconfirmedClaims(payloadFinalizado());

  assert.equal(payload.finalizedBundle, null, "OPTIMISTIC_FINALIZED = NO");
  assert.equal(payload.analysisCompletedAt, null, "nem o carimbo que destrava o FINALIZE");
  assert.deepEqual(stripped, ["analysisCompletedAt", "finalizedBundle"]);

  /*
   * E O TRABALHO CONTINUA INTEIRO.
   *
   * Esta é a metade que justifica o fallback existir: onze páginas lidas não
   * podem sumir porque o servidor recusou um carimbo. Apagar tudo seria trocar
   * um defeito por outro, mais caro.
   */
  assert.equal(payload.extractions.length, 2);
  assert.deepEqual(payload.benchmark, { validPageCount: 11 });
  assert.ok(payload.competitiveReport, "o relatório é trabalho, não afirmação");
  assert.equal(payload.verifiedSources.length, 1);

  /* Uma versão sem afirmação nenhuma passa intacta, e diz que nada saiu. */
  const semCarimbo = radarStripUnconfirmedClaims({ ...payloadFinalizado(), analysisCompletedAt: null, finalizedBundle: null });
  assert.deepEqual(semCarimbo.stripped, []);
  assert.equal(radarUnconfirmedClaimsNotice(semCarimbo.stripped), null, "sem pendência, sem aviso");
});

test("RADAR 18.10 · B — as duas afirmações são independentes", () => {
  /* Só o bundle falhou: o carimbo da análise continua, porque ele foi aceito. */
  const soBundle = radarStripUnconfirmedClaims({ ...payloadFinalizado(), analysisCompletedAt: null });
  assert.deepEqual(soBundle.stripped, ["finalizedBundle"]);

  const soAnalise = radarStripUnconfirmedClaims({ ...payloadFinalizado(), finalizedBundle: null });
  assert.deepEqual(soAnalise.stripped, ["analysisCompletedAt"]);

  /* E cada uma nomeia a própria etapa — colapsá-las esconderia qual falhou. */
  const avisoBundle = radarUnconfirmedClaimsNotice(soBundle.stripped)!;
  const avisoAnalise = radarUnconfirmedClaimsNotice(soAnalise.stripped)!;
  assert.match(avisoBundle, /congelamento da investigação/);
  assert.match(avisoAnalise, /gravação final da análise/);
  assert.notEqual(avisoBundle, avisoAnalise);

  assert.deepEqual([...RADAR_REMOTE_ONLY_CLAIMS], ["analysisCompletedAt", "finalizedBundle"]);
});

/* ==========  C · O ÚNICO CAMINHO ATÉ FINALIZED  ====================== */

test("RADAR 18.10 · C — FINALIZED exige remoto E readback, nunca um só", () => {
  const sucesso = radarActionOutcome({ action: "FINALIZE", persistence: { persistenceMode: "remote", readbackConfirmed: true }, successMessage: "ok" });
  assert.equal(sucesso.advances, true);

  for (const parcial of [
    { persistenceMode: "remote" as const, readbackConfirmed: false },
    { persistenceMode: "local" as const, readbackConfirmed: true },
    { persistenceMode: "local" as const, readbackConfirmed: false },
  ]) {
    const desfecho = radarActionOutcome({ action: "FINALIZE", persistence: parcial, successMessage: "ok" });
    assert.equal(desfecho.advances, false, JSON.stringify(parcial));
  }

  /* E o handler não escreve estado próprio: quem decide é o desfecho. */
  const finalizar = trecho(pagina(), "const finalizeInvestigation = async () => {", "const reviewSerpForArticle = async");
  /* HOTFIX 18.10.3 · o congelamento também exige remoto e mostra o erro real. */
  assert.match(finalizar, /const gravado = await pipeline\.saveRadarAnalysis\(target\.articleId, next, \{ requireRemote: true \}\);/);
  assert.match(finalizar, /radarActionOutcome\(\{\s*\r?\n?\s*action: "FINALIZE"/);
  assert.equal(/updateLocalState|setCollectionState/.test(finalizar), false, "a finalização não pinta estado local por fora");
});

/* ==========  F e G · O F5 É A PROVA DE AUTORIDADE  =================== */

test("RADAR 18.10 · F e G — o que sobrevive ao F5 é o que o servidor guardou", () => {
  const fonte = contextoDoPipeline();
  const fallback = trecho(fonte, "const semAutoridade = radarStripUnconfirmedClaims(parsed.payload);", "return { persistenceMode: \"local\" as const");

  /* A versão aplicada em memória é a SEM autoridade — não a original. */
  assert.match(fallback, /const versaoLocal = semAutoridade\.stripped\.length \? \{ \.\.\.parsed, payload: semAutoridade\.payload \} : parsed;/);
  assert.match(fallback, /analysisVersions: nextItem\.analysisVersions\.map\(version => version\.versionId === parsed\.versionId \? versaoLocal : version\)/);
  assert.match(fonte, /radarItems: current\.radarItems\.map\(item => item\.articleId === articleId \? itemLocal : item\)/, "o item aplicado é o local");
  assert.equal(/\? nextItem : item\), persistenceMode: "local_fallback"/.test(fonte), false, "o item com carimbo não pode voltar a ser aplicado");

  /*
   * E A CÓPIA DO NAVEGADOR GUARDA O MESMO.
   *
   * Se o snapshot do `localStorage` levasse a versão original, o F5
   * ressuscitaria "Finalizado" a partir do cache — e a contradição voltaria
   * pela porta que este gate acabou de fechar, com outra aparência.
   */
  assert.match(fallback, /saveLocalRadarAnalysisRecovery\(actorUserId, selectedBrandId, workspaceLocal\)/, "F5_STATE_EQUALS_REMOTE_STATE = YES");
  assert.match(fallback, /const workspaceLocal = \{ \.\.\.workspace, radarItems: workspace\.radarItems\.map\(item => item\.articleId === articleId \? itemLocal : item\) \}/);
  assert.equal(/saveLocalRadarAnalysisRecovery\(actorUserId, selectedBrandId, nextWorkspace\)/.test(fonte), false, "o workspace com carimbo não vai para o cache");
});

/* ==========  E · A PLANILHA LÊ A MESMA AUTORIDADE  ================== */

test("RADAR 18.10 · E — a planilha recusa avançar sem o carimbo remoto", () => {
  const base = { contextReady: true, hasPrimaryQuery: true, running: false, selected: 16, pending: 0, failed: 5, analyzed: 11 } as const;

  const semCarimbo = radarPhase1Action({ ...base, state: "AWAITING_REVIEW", analysisConfirmed: false, persistedExtractions: 11 });
  /*
   * A INVARIANTE É "FINALIZE NÃO É OFERECIDO" — não "não há ação".
   *
   * O 18.10 entregou esta recusa como botão morto, que era honesto e deixava
   * o artigo parado. O 18.10.1 a transformou em retomada da consolidação: o
   * que não pode voltar é FINALIZE sobre uma análise que o servidor não
   * carimbou.
   */
  assert.notEqual(semCarimbo.id, "FINALIZE_SERP", "FINALIZE_VISIBLE_BEFORE_READBACK = NO");
  assert.equal(semCarimbo.id, "ANALYZE_COMPETITION", "o que falta é consolidar, e isso é acionável");
  assert.equal(semCarimbo.label, "Concluir análise");
  assert.match(semCarimbo.hint!, /11 página\(s\) já gravadas no servidor/);

  const comCarimbo = radarPhase1Action({ ...base, state: "AWAITING_REVIEW", analysisConfirmed: true });
  assert.equal(comCarimbo.id, "FINALIZE_SERP");
  assert.equal(comCarimbo.enabled, true);

  /*
   * ESTE É O ESTADO EM QUE O USER FICOU.
   *
   * Com o carimbo removido do fallback, a tela passa a mostrar ANTES do F5
   * exatamente o que mostraria DEPOIS — que é o ponto do §11. O bloqueio é
   * honesto; o que falta é um caminho de retomada, e ele depende da auditoria
   * remota para não refazer trabalho caro.
   */
  assert.notEqual(semCarimbo.label, "Pesquisa finalizada");
});

/* ==========  J, K e L · O QUE ESTE CAMINHO NÃO FAZ  ================= */

test("RADAR 18.10 · J, K e L — cache não veta, e nada caro nasce daqui", () => {
  const fonte = contextoDoPipeline();
  const autoridade = readFileSync(new URL("../lib/radar/remote-authority.ts", import.meta.url), "utf8");

  /* J · a falha de quota continua best-effort — garantia do 18.8, intacta. */
  assert.equal(/!saveLocalRadarAnalysisRecovery\(/.test(fonte), false, "LOCAL_STORAGE_CAN_VETO = NO");
  assert.equal(/localStorage\.removeItem|localStorage\.clear/.test(fonte), false, "nada de limpeza automática");

  /* E o fallback continua rodando mesmo quando a cópia local falha. */
  const fallback = trecho(fonte, "const semAutoridade = radarStripUnconfirmedClaims(parsed.payload);", "return { persistenceMode: \"local\" as const");
  assert.match(fallback, /recuperacaoDaAnalise\.saved \? null : localRecoveryWarning\(/, "a falha do cache vira aviso, não bloqueio");

  /* K e L · a autoridade é domínio puro: sem rede, sem provider, sem extração. */
  assert.equal(/fetch\(|dataforseo|extractions\?\.\w+\(/i.test(autoridade), false);
  assert.equal(/collectSerp|verify-sources|radar-analysis\/extract/.test(autoridade), false, "PAGE_EXTRACTION_ON_RETRY = 0");

  /* E o readback obrigatório continua de pé — não foi afrouxado para passar. */
  assert.match(fonte, /if \(!readbackResponse\.ok\) throw new Error\(/);
  assert.match(fonte, /readbackBody\.persistenceMode !== "remote" \|\| readbackBody\.readbackConfirmed !== true/);
  assert.match(fonte, /não corresponde ao snapshot selecionado/, "a checagem de identidade da versão continua");
});

/* ==========  M · A MENSAGEM NÃO AFIRMA O QUE O REMOTO NÃO CONFIRMA  == */

test("RADAR 18.10 · M — o aviso nomeia a etapa pendente, sem prometer conclusão", () => {
  const aviso = radarUnconfirmedClaimsNotice(["analysisCompletedAt", "finalizedBundle"])!;

  assert.match(aviso, /não foi confirmado pelo servidor/);
  assert.match(aviso, /não aparece como concluído/);
  assert.match(aviso, /Nada precisa ser refeito do zero/, "senão a pessoa repete uma operação cara");
  assert.equal(/análise concluída|investigação finalizada|foi congelada/i.test(aviso), false, "não afirma etapa não confirmada");

  /* E a tela usa essa frase em vez da genérica de recuperação local. */
  const persistir = trecho(pagina(), "const persistSerpAnalysis = async", "return saved;");
  assert.match(persistir, /radarUnconfirmedClaimsNotice\(/);

  /*
   * A PONTE: A TELA PEDE, O CONTEXTO MANDA.
   *
   * `radarUnconfirmedClaimsNotice([])` devolve `null`, e a tela cai na frase
   * genérica sem nenhum erro — então um contexto que parasse de enviar
   * `unconfirmedClaims` apagaria o nome da etapa em silêncio, que é o defeito
   * de comunicação que este gate existe para fechar. Os dois lados são fixados.
   */
  const contexto = contextoDoPipeline();
  assert.match(contexto, /readbackConfirmed: false, unconfirmedClaims: semAutoridade\.stripped \}/, "o fallback declara o que ficou sem carimbo");
  assert.match(contexto, /readbackConfirmed: true, unconfirmedClaims: \[\] as readonly string\[\] \}/, "e o sucesso declara que nada ficou");
  assert.equal(/A recuperação local foi atualizada, mas a persistência remota não foi confirmada/.test(persistir), false, "a frase imprecisa saiu");
  assert.match(persistir, /Persistência remota e readback confirmados/, "e o sucesso continua sendo dito por inteiro");
});

/* ==========  A CONTA DA REDE  ======================================== */

test("RADAR 18.10 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `SERP_PROVIDER_CALLS = 0 — tentativas: ${tentativasDeRede.join(", ")}`);
});
