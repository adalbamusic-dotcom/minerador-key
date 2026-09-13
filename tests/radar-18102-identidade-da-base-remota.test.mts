import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { radarResumableRemoteAnalysis, type RadarResumableVersion } from "../lib/radar/remote-authority.ts";
import { radarPersistedOperationIsFeminine, radarPersistedOperationLabel } from "../lib/radar/persisted-operation.ts";
import { localRecoveryWarning } from "../lib/editorial/local-recovery.ts";

/*
 * ======  RADAR · GATE 18.10.2 — SOURCE_ANALYSIS_UNKNOWN  ===============
 *
 * O smoke do 18.10.1 acertou a parte cara: nenhuma página foi relida. E então:
 *
 *   "Verificando 2 fonte(s) relevante(s)…"
 *   [radar:verify-sources] SOURCE_ANALYSIS_UNKNOWN
 *   { "analysisVersionId": "9dab0c90-0f68-4d07-8d39-cd4fcc7f05fb" }
 *
 * A v24 remota é `7bcab027-7b18-4585-9f16-5eef133a92b4`. O id mandado ao
 * servidor era outro — e a regressão é minha, do gate anterior.
 *
 * A CADEIA:
 *
 *   retomandoConsolidacao ⇒ versaoDaAmostra = data.analysis
 *   data.analysis         = a versão que a TELA mostra
 *   o workspace guarda TAMBÉM versões aplicadas localmente — o fallback do
 *   18.10 as coloca lá DE PROPÓSITO, para não perder trabalho
 *   ⇒ a mais recente delas venceu `latestAnalysis` e virou a base
 *   ⇒ `analysisVersionId` só existia em memória
 *   ⇒ o endpoint, que lê o que está GRAVADO, não achou nada
 *
 * O contrato do endpoint (auditado, não presumido):
 *
 *   VERIFY_SOURCES_LOADS_ANALYSIS_FROM_REMOTE   = YES
 *   VERIFY_SOURCES_REQUIRES_PERSISTED_VERSION_ID = YES
 *   VERIFY_SOURCES_NEEDS_WHICH_FIELDS            = payload.extractions e
 *                                                  payload.articleDnaVersionId
 *
 * Ele NÃO precisa de nada produzido por uma sucessora: a v24 já tem tudo.
 * Logo CAMINHO A — a base é LIDA do banco, e nenhuma escrita intermediária é
 * necessária.
 *
 * O QUE ESTE GATE PROVA:
 *   A/B/D  a base vem do servidor, provada antes de qualquer fetch
 *   C      nenhuma escrita intermediária foi introduzida
 *   E/F/G  as 11 páginas são reutilizadas; zero extração, zero SERP
 *   H      as 2 verificações planejadas são as 2 executadas
 *   I      o caminho válido não pode produzir SOURCE_ANALYSIS_UNKNOWN
 *   J/K/M  o carimbo continua exigindo readback, e FINALIZE continua atrás dele
 *   §10    "O relatório competitivo foi concluído"
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

const pagina = () => readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
const contextoDoPipeline = () => readFileSync(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");
const rotaDeFontes = () => readFileSync(new URL("../app/api/editorial/radar-analysis/verify-sources/route.ts", import.meta.url), "utf8");

function trecho(fonte: string, de: string, ate: string): string {
  const inicio = fonte.indexOf(de);
  assert.notEqual(inicio, -1, `âncora inicial ausente: ${de}`);
  const fim = fonte.indexOf(ate, inicio + de.length);
  assert.notEqual(fim, -1, `âncora final ausente: ${ate}`);
  return fonte.slice(inicio, fim);
}

const SNAPSHOT = { id: "7c68012c-3b64-42e8-8ddf-b7730c32da02", version: 8, hash: "sha256:" + "b".repeat(64) };
const DNA = "dna-188";

const versao = (patch: { versionId: string; versionNumber: number; extractions?: number; dna?: string; snapshotId?: string; snapshotVersion?: number; hash?: string }): RadarResumableVersion => ({
  versionId: patch.versionId,
  versionNumber: patch.versionNumber,
  payload: {
    articleDnaVersionId: patch.dna ?? DNA,
    serpSnapshotId: patch.snapshotId ?? SNAPSHOT.id,
    serpSnapshotVersion: patch.snapshotVersion ?? SNAPSHOT.version,
    serpSnapshotHash: patch.hash ?? SNAPSHOT.hash,
    extractions: Array.from({ length: patch.extractions ?? 11 }, (_, indice) => ({ id: `p${indice}` })),
  },
});

const V24 = "7bcab027-7b18-4585-9f16-5eef133a92b4";
const LOCAL = "9dab0c90-0f68-4d07-8d39-cd4fcc7f05fb";

/* ==========  A e B · A BASE VEM DO BANCO  ============================ */

test("RADAR 18.10.2 · A e B — a base da retomada é a versão gravada, e só ela", () => {
  const escolha = radarResumableRemoteAnalysis({
    analyses: [versao({ versionId: "antiga", versionNumber: 20, dna: "dna-antigo" }), versao({ versionId: V24, versionNumber: 24 })],
    snapshot: SNAPSHOT,
    articleDnaVersionId: DNA,
  });

  assert.equal(escolha.ok, true);
  assert.equal(escolha.ok && escolha.version.versionId, V24, "VERIFY_SOURCES_ANALYSIS_VERSION_ID = v24 remota");
  assert.match(escolha.ok ? escolha.reason : "", /versão 24 gravada no servidor, com 11 página\(s\)/);

  /*
   * A LISTA É A DO SERVIDOR — a função nunca vê o workspace.
   *
   * A versão local `9dab0c90` simplesmente não está entre as candidatas,
   * porque quem alimenta esta entrada é um readback. É isso que torna
   * impossível repetir o erro, e não uma checagem a mais depois.
   */
  assert.equal(escolha.ok && escolha.version.versionId === LOCAL, false);
});

test("RADAR 18.10.2 · a base precisa ser do MESMO snapshot e do MESMO fundamento", () => {
  const base = { snapshot: SNAPSHOT, articleDnaVersionId: DNA };

  const semNada = radarResumableRemoteAnalysis({ ...base, analyses: [] });
  const outroDna = radarResumableRemoteAnalysis({ ...base, analyses: [versao({ versionId: "x", versionNumber: 24, dna: "outro" })] });
  const outroSnapshot = radarResumableRemoteAnalysis({ ...base, analyses: [versao({ versionId: "x", versionNumber: 24, snapshotId: "outro" })] });
  const outroHash = radarResumableRemoteAnalysis({ ...base, analyses: [versao({ versionId: "x", versionNumber: 24, hash: "sha256:" + "c".repeat(64) })] });
  const semPaginas = radarResumableRemoteAnalysis({ ...base, analyses: [versao({ versionId: "x", versionNumber: 24, extractions: 0 })] });

  for (const recusa of [semNada, outroDna, outroSnapshot, outroHash, semPaginas]) assert.equal(recusa.ok, false);

  /* Cada recusa diz a sua causa: colapsá-las esconderia qual aconteceu. */
  const motivos = [semNada, outroDna, outroSnapshot, semPaginas].map(item => item.reason);
  assert.equal(new Set(motivos).size, 4);
  assert.match(outroDna.reason, /outra versão do ArticleDNA/);
  assert.match(outroSnapshot.reason, /snapshot SERP corrente/);
  assert.match(semPaginas.reason, /não têm páginas extraídas/);

  /* Entre várias válidas, a mais recente vence — e pela versão, não pela ordem. */
  const varias = radarResumableRemoteAnalysis({
    ...base,
    analyses: [versao({ versionId: "v24", versionNumber: 24 }), versao({ versionId: "v22", versionNumber: 22 }), versao({ versionId: "v23", versionNumber: 23 })],
  });
  assert.equal(varias.ok && varias.version.versionId, "v24");
});

/* ==========  C e D · NENHUMA ESCRITA, NENHUM FETCH ÀS CEGAS  ======== */

test("RADAR 18.10.2 · C e D — leitura, prova e só então o endpoint", () => {
  const corpo = trecho(pagina(), "const analyzeSerpSelection = async", "const reviewSerpForArticle = async");

  const leitura = corpo.indexOf("const remoto = await pipeline.readRemoteRadarAnalyses(target.articleId);");
  const prova = corpo.indexOf("const base = radarResumableRemoteAnalysis({");
  const verificacao = corpo.indexOf("/api/editorial/radar-analysis/verify-sources");
  assert.ok(leitura > 0 && prova > leitura && verificacao > prova, "leitura → prova → verificação, nesta ordem");

  /*
   * D · A RECUSA É LOCAL, ANTES DE GASTAR QUALQUER COISA.
   *
   * Chamar o endpoint sabendo que a identidade é inválida seria pagar por um
   * erro conhecido — e foi exatamente o que o smoke fez, duas verificações
   * adiante.
   */
  assert.match(corpo, /if \(!base\.ok\) throw new Error\(`A consolidação não pôde ser retomada: \$\{base\.reason\}`\);/);
  assert.match(corpo, /if \(!remoto\.available\) throw new Error\(/);
  const entreProvaEVerificacao = corpo.slice(prova, verificacao);
  assert.match(entreProvaEVerificacao, /if \(!base\.ok\) throw/, "a recusa fica entre a prova e o fetch");

  /*
   * C · INTERMEDIATE_REMOTE_WRITE_REQUIRED = NO.
   *
   * O endpoint só precisa das extractions e do fundamento, e a v24 tem os dois.
   * Uma escrita intermediária existiria apenas para criar um id — trabalho e
   * uma versão a mais no histórico, por nada.
   */
  assert.match(corpo, /const amostraSalva = retomandoConsolidacao\s*\r?\n\s*\? \{ persistenceMode: "remote" as const, readbackConfirmed: true \}/);
  /*
   * Duas chamadas existem na FONTE — a da amostra e a final — e na retomada
   * apenas a final executa: a da amostra fica atrás do mesmo ternário acima.
   */
  assert.equal((corpo.match(/await pipeline\.saveRadarAnalysis/g) || []).length, 2, "amostra e final, e a amostra é pulada na retomada");
  assert.match(corpo, /: await pipeline\.saveRadarAnalysis\(target\.articleId, versaoDaAmostra\);/, "a da amostra só roda fora da retomada");
});

test("RADAR 18.10.2 · §4 — o endpoint continua lendo do banco, e não do cliente", () => {
  const rota = rotaDeFontes();

  /* A proteção que NÃO pode ser afrouxada para 'resolver' o erro. */
  assert.match(rota, /new WorkflowRepository\(\)\.findByArticle\(input\.brandId, input\.articleId, "radar"\)/);
  assert.match(rota, /versoes\.find\(version => version\.versionId === input\.analysisVersionId\)/);
  assert.match(rota, /RADAR_SOURCE_VERIFICATION_ERROR\.ANALYSIS_UNKNOWN/);
  assert.match(rota, /persistida\.payload\.articleDnaVersionId !== input\.articleDnaVersionId/, "o fundamento continua conferido");

  /* E o plano continua nascendo das páginas GRAVADAS, nunca do corpo do pedido. */
  assert.match(rota, /const pages = persistida\.payload\.extractions;/);
  assert.equal(/input\.pages|input\.extractions|body\.pages/.test(rota), false, "o cliente não manda páginas");
});

/* ==========  E, F e G · O TRABALHO CARO CONTINUA FORA  ============== */

test("RADAR 18.10.2 · E, F e G — 11 reutilizadas, zero extração, zero SERP", () => {
  const corpo = trecho(pagina(), "const analyzeSerpSelection = async", "const reviewSerpForArticle = async");

  assert.match(corpo, /let fila = retomandoConsolidacao \? \[\] : \[\.\.\.candidates\];/, "PAGE_EXTRACTION_CALLS = 0");
  assert.match(corpo, /const paginasDaAmostra = versaoDaAmostra\.payload\.extractions;/);
  assert.equal(/collectSerp\(|collectAuxiliarySerp|dataforseo/i.test(corpo), false, "SERP_PROVIDER_CALLS = 0");

  /*
   * E OS MODELOS SAEM DAS PÁGINAS DA BASE.
   *
   * `pages` é o que foi lido AGORA — zero na retomada. Construir o benchmark
   * sobre ele gravaria um carimbo de análise sobre nada: zero comparáveis, zero
   * termos recorrentes, competitividade "insufficient_evidence". O trabalho
   * está nas páginas gravadas, e é delas que o modelo nasce.
   */
  assert.match(corpo, /const paginasDoModelo = retomandoConsolidacao \? paginasDaAmostra : pages;/);
  assert.match(corpo, /buildRadarBenchmark\(versaoDaAmostra\.payload\.mode, paginasDoModelo\.filter\(/);
  assert.match(corpo, /const semanticTerms = paginasDoModelo\.flatMap\(/);
  assert.match(corpo, /const competitorCount = paginasDoModelo\.length;/);
});

/* ==========  H · SÓ AS VERIFICAÇÕES PLANEJADAS  ==================== */

test("RADAR 18.10.2 · H — o plano decide quantas fontes verificar", () => {
  const corpo = trecho(pagina(), "const analyzeSerpSelection = async", "const reviewSerpForArticle = async");

  /* O plano nasce das páginas da base; a tela manda ids, não endereços. */
  assert.match(corpo, /analysisVersionId: versaoDaAmostra\.versionId/);
  assert.match(corpo, /articleDnaVersionId: versaoDaAmostra\.payload\.articleDnaVersionId/);
  assert.match(corpo, /Verificando \$\{planoDeFontes\.length\} fonte\(s\) relevante\(s\)…/);

  /* E o retry de fonte só repete as recuperáveis — nunca a lista inteira. */
  assert.match(corpo, /filaDeFontes = recuperaveisDeFonte\.map\(falha => falha\.sourceId\);/);
});

/* ==========  J, K e M · O CARIMBO CONTINUA ATRÁS DO READBACK  ====== */

test("RADAR 18.10.2 · J, K e M — nada mudou na exigência de readback", () => {
  const fonte = contextoDoPipeline();

  assert.match(fonte, /if \(!readbackResponse\.ok\) throw new Error\(/);
  assert.match(fonte, /não corresponde ao snapshot selecionado/);

  /* E o fallback continua sem poder carregar afirmações de autoridade remota. */
  assert.match(fonte, /const semAutoridade = radarStripUnconfirmedClaims\(parsed\.payload\);/);
  assert.match(fonte, /localRecoveryWarning: null \}\)\);/, "o sucesso remoto apaga o aviso do navegador");

  /* A leitura nova é LEITURA: ela não grava nada. */
  const leitura = trecho(fonte, "readRemoteRadarAnalyses: async (articleId) => {", "reviewSerp: async (articleId");
  assert.equal(/updateWorkspace|saveRadarAnalysis|method: "POST"/.test(leitura), false, "LOCAL_STORAGE_CAN_VETO = NO e nenhuma escrita");
  assert.match(leitura, /body\.readbackConfirmed !== true/, "e ela exige confirmação do servidor");
});

/* ==========  §10 · A CONCORDÂNCIA  ================================= */

test("RADAR 18.10.2 · §10 — 'O relatório competitivo foi concluído'", () => {
  const relatorio = { extractions: [{}], analysisCompletedAt: null, competitiveReport: {}, finalizedBundle: null };
  assert.equal(radarPersistedOperationLabel(relatorio), "O relatório competitivo");
  assert.equal(radarPersistedOperationIsFeminine(relatorio), false);

  const frase = localRecoveryWarning({
    operation: radarPersistedOperationLabel(relatorio),
    operationFeminine: radarPersistedOperationIsFeminine(relatorio),
    reason: "o armazenamento local do navegador está cheio (quota excedida)",
    remoteConfirmed: false,
  });
  assert.match(frase, /^O relatório competitivo foi concluído e está aplicado nesta aba/);
  assert.match(frase, /pode perdê-lo/);
  assert.equal(/concluída|aplicada|perdê-la/.test(frase), false, "nenhuma concordância feminina sobrou");

  /* E o feminino continua correto onde ele é o certo. */
  const analise = { extractions: [{}, {}], analysisCompletedAt: "x", competitiveReport: null, finalizedBundle: null };
  assert.equal(radarPersistedOperationIsFeminine(analise), true);
  const feminina = localRecoveryWarning({
    operation: radarPersistedOperationLabel(analise),
    operationFeminine: radarPersistedOperationIsFeminine(analise),
    reason: "quota", remoteConfirmed: true,
  });
  assert.match(feminina, /^A análise da concorrência foi salva remotamente e não precisa ser refeita/);
});

/* ==========  A CONTA  ============================================== */

test("RADAR 18.10.2 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS = 0 — tentativas: ${tentativasDeRede.join(", ")}`);
});
