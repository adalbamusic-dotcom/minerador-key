import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localRecoveryWarning } from "../lib/editorial/local-recovery.ts";
import { radarPersistedOperationLabel } from "../lib/radar/persisted-operation.ts";

/*
 * ======  RADAR · GATE 18.9.1 — A COPY DA FALHA DE RECOVERY LOCAL  ======
 *
 * O smoke do 18.9 passou inteiro: v8 recuperada, pesquisa materializada, três
 * auxiliares executadas, 4 consultas, 17 páginas observadas, 16 selecionadas,
 * persistência remota e readback confirmados, fase "Pronto para analisar".
 *
 * E a tela exibiu:
 *
 *   "A análise do Radar foi concluída e não precisa ser refeita…"
 *
 * ao lado de "0 páginas analisadas · Pronto para analisar · Analisar
 * concorrência".
 *
 * DOIS DEFEITOS, NÃO UM.
 *
 * 1. O NOME ERRADO. `saveRadarAnalysis` grava a versão do Radar, e a versão
 *    pode conter pesquisa, análise, relatório ou finalização. O aviso chamava
 *    tudo de "análise" porque olhava o nome do endpoint em vez do conteúdo — e
 *    afirmava que uma etapa que nem começou tinha terminado.
 *
 * 2. O AVISO VELHO. O caminho de sucesso remoto nunca limpava
 *    `localRecoveryWarning`. O banner que o USER viu DEPOIS de "persistência
 *    remota e readback confirmados" descrevia uma falha de cache anterior, já
 *    superada. Persistência remota é a autoridade; o cache é conveniência —
 *    e a conveniência estava falando por cima da autoridade.
 *
 * O QUE ESTE GATE PROVA:
 *   A   o nome sai do ARTEFATO, e cada etapa tem o seu
 *   B   READY_TO_ANALYZE + falha local ⇒ NUNCA diz que a análise terminou
 *   C   ANALYZED + falha local ⇒ PODE nomear a análise
 *   D   remoto confirmado e remoto não confirmado são duas frases
 *   E   o sucesso remoto apaga o aviso do navegador
 *   F   o ciclo não mudou, o localStorage não é limpo, nada é refeito
 *   G   PROVIDER_CALLS = 0 · DATABASE_CHANGE = NO
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

/** A versão exatamente como o "Completar Pesquisa Google" a gravou no smoke. */
const versaoDaPesquisa = {
  deepResearch: { primarySearchMode: "WEB" },
  extractions: [],
  analysisCompletedAt: null,
  competitiveReport: null,
  finalizedBundle: null,
};

/* ==========  A · O NOME SAI DO ARTEFATO  ============================== */

test("RADAR 18.9.1 · A — cada etapa é nomeada pelo que a versão guarda", () => {
  assert.equal(radarPersistedOperationLabel(versaoDaPesquisa), "A Pesquisa Google");
  assert.equal(radarPersistedOperationLabel({ ...versaoDaPesquisa, deepResearch: { primarySearchMode: "YOUTUBE" } }), "A Pesquisa YouTube");

  assert.equal(radarPersistedOperationLabel({ ...versaoDaPesquisa, extractions: [{}, {}] }), "A análise da concorrência");
  assert.equal(radarPersistedOperationLabel({ ...versaoDaPesquisa, analysisCompletedAt: "2026-09-11T13:00:00.000Z" }), "A análise da concorrência");
  assert.equal(radarPersistedOperationLabel({ ...versaoDaPesquisa, competitiveReport: {} }), "O relatório competitivo");
  assert.equal(radarPersistedOperationLabel({ ...versaoDaPesquisa, finalizedBundle: {} }), "A finalização da investigação");

  /*
   * A ORDEM É A DO CICLO, DO FIM PARA O COMEÇO.
   *
   * Uma versão congelada também carrega análise e pesquisa dentro. Se a ordem
   * invertesse, a finalização seria anunciada como "Pesquisa Google".
   */
  const tudoJunto = { deepResearch: { primarySearchMode: "WEB" }, extractions: [{}], analysisCompletedAt: "x", competitiveReport: {}, finalizedBundle: {} };
  assert.equal(radarPersistedOperationLabel(tudoJunto), "A finalização da investigação");
  assert.equal(radarPersistedOperationLabel({ ...tudoJunto, finalizedBundle: null }), "O relatório competitivo");
  assert.equal(radarPersistedOperationLabel({ ...tudoJunto, finalizedBundle: null, competitiveReport: null }), "A análise da concorrência");

  /* Sem nenhuma marca, a versão guarda decisão de SERP — e diz isso. */
  assert.equal(radarPersistedOperationLabel({ ...versaoDaPesquisa, deepResearch: null }), "A curadoria da SERP");
  assert.equal(radarPersistedOperationLabel(null), "A operação do Radar");
});

/* ==========  B · O CASO DO SMOKE  ==================================== */

test("RADAR 18.9.1 · B — pronto para analisar nunca vira 'análise concluída'", () => {
  /* O estado exato do smoke: pesquisa gravada, zero páginas lidas. */
  const frase = localRecoveryWarning({
    operation: radarPersistedOperationLabel(versaoDaPesquisa),
    reason: "o armazenamento local do navegador está cheio (quota excedida)",
    remoteConfirmed: true,
  });

  assert.match(frase, /^A Pesquisa Google foi salva remotamente/, "o aviso nomeia o que foi gravado");

  /*
   * A PROIBIÇÃO, LITERAL.
   *
   * Nenhuma variação de "análise concluída/terminada/feita" pode aparecer
   * enquanto a fase é READY_TO_ANALYZE com zero páginas.
   */
  assert.equal(/an[áa]lise/i.test(frase), false, "a palavra análise não cabe nesta frase");
  assert.equal(/conclu[íi]da e n[ãa]o precisa/i.test(frase.replace(/A Pesquisa Google foi salva remotamente[^.]*\./, "")), false);
  assert.doesNotMatch(frase, /A análise do Radar/, "a frase do smoke não pode voltar");

  /* E ela diz o que o USER pediu: remoto salvo, só o navegador falhou. */
  assert.match(frase, /Apenas a cópia de recuperação no navegador não pôde ser atualizada/);
  assert.match(frase, /quota excedida/);
});

/* ==========  C · QUANDO É ANÁLISE MESMO, PODE DIZER  ================= */

test("RADAR 18.9.1 · C — com páginas lidas, nomear a análise é correto", () => {
  const frase = localRecoveryWarning({
    operation: radarPersistedOperationLabel({ ...versaoDaPesquisa, extractions: [{}, {}, {}], analysisCompletedAt: "2026-09-11T13:00:00.000Z" }),
    reason: "o armazenamento local do navegador está cheio (quota excedida)",
    remoteConfirmed: true,
  });
  assert.match(frase, /^A análise da concorrência foi salva remotamente/, "a proibição é sobre mentir, não sobre a palavra");
});

/* ==========  D · DUAS SITUAÇÕES, DUAS FRASES  ======================== */

test("RADAR 18.9.1 · D — sem confirmação remota, a frase não promete segurança", () => {
  const comum = { operation: "A Pesquisa Google", reason: "o armazenamento local do navegador está cheio (quota excedida)" };
  const confirmado = localRecoveryWarning({ ...comum, remoteConfirmed: true });
  const naoConfirmado = localRecoveryWarning({ ...comum, remoteConfirmed: false });

  assert.notEqual(confirmado, naoConfirmado, "colapsar as duas foi o defeito");

  assert.match(confirmado, /não precisa ser refeita/);
  assert.equal(/não precisa ser refeita/.test(naoConfirmado), false, "sem servidor confirmado, essa promessa é infundada");

  /*
   * E A SEGUNDA NÃO MANDA REFAZER.
   *
   * Refazer custaria outra consulta paga. Ela diz ONDE o trabalho está e o que
   * o pode apagar — a pessoa decide.
   */
  assert.match(naoConfirmado, /aplicada nesta aba/);
  assert.match(naoConfirmado, /Recarregar a página pode perdê-la/);
  assert.equal(/refaça|refazer a pesquisa|tente novamente/i.test(naoConfirmado), false);

  /* As duas nomeiam o navegador como responsável, e nenhuma acusa o servidor. */
  for (const frase of [confirmado, naoConfirmado]) assert.match(frase, /navegador/);
});

/* ==========  E · O REMOTO CONFIRMADO CALA O AVISO  =================== */

test("RADAR 18.9.1 · E — gravação remota confirmada apaga o banner do navegador", () => {
  const fonte = contextoDoPipeline();

  /*
   * O BANNER ERA VELHO, NÃO NOVO.
   *
   * O caminho de sucesso remoto de `saveRadarAnalysis` atualizava os itens e
   * seguia sem tocar no aviso — então uma falha de cache de minutos antes
   * continuava na tela depois de "readback confirmado".
   */
  const sucessoRemoto = fonte.slice(
    fonte.indexOf("const persistedAnalysis = VersionedRadarAnalysisSchema.parse(readbackBody.analysis);"),
    fonte.indexOf("return { persistenceMode: \"remote\" as const, readbackConfirmed: true };"),
  );
  assert.notEqual(sucessoRemoto.length, 0, "âncoras do caminho de sucesso remoto");
  assert.match(sucessoRemoto, /persistenceMode: "server"/);
  assert.match(sucessoRemoto, /localRecoveryWarning: null/, "REMOTE_IS_AUTHORITY = YES");

  /* E o ramo de fallback nomeia a operação pelo payload, não pelo endpoint. */
  assert.match(fonte, /localRecoveryWarning\(\{ operation: radarPersistedOperationLabel\(parsed\.payload\)/);
  assert.equal(/operation: "A análise do Radar"/.test(fonte), false, "o rótulo fixo do smoke não pode voltar");

  /*
   * E ELE SE DECLARA NÃO CONFIRMADO — a mentira inversa também é mentira.
   *
   * Este ramo só é alcançado depois de a escrita remota falhar ou ficar
   * indisponível: é a definição do fallback. Passar `remoteConfirmed: true`
   * aqui produziria "foi salva remotamente" sobre algo que o servidor nunca
   * aceitou — o mesmo defeito do smoke, invertido. O valor é literal porque a
   * condição é estrutural: não há caminho até esta linha com remoto confirmado.
   */
  assert.match(
    fonte,
    /localRecoveryWarning\(\{ operation: radarPersistedOperationLabel\(parsed\.payload\), operationFeminine: radarPersistedOperationIsFeminine\(parsed\.payload\), reason: recuperacaoDaAnalise\.reason \|\| "causa não identificada", remoteConfirmed: false \}\)/,
    "REMOTE_CONFIRMED_IN_FALLBACK = NO",
  );

  /* A coleta informa o que o servidor respondeu, em vez de supor. */
  assert.match(fonte, /remoteConfirmed: body\.persistenceMode === "remote"/);
});

/* ==========  F · O QUE ESTE GATE NÃO PODIA TOCAR  ==================== */

test("RADAR 18.9.1 · F — ciclo intacto, localStorage intacto, nada refeito", () => {
  const fonte = contextoDoPipeline();

  /* Nenhuma limpeza automática do cache: o comentário histórico continua de pé. */
  assert.equal(/localStorage\.removeItem|localStorage\.clear/.test(fonte), false, "NÃO limpar localStorage automaticamente");

  /* O cache continua sem poder de veto — garantia do 18.8. */
  assert.equal(/!saveLocalSerpRecovery\(/.test(fonte), false);
  assert.equal(/!saveLocalRadarAnalysisRecovery\(/.test(fonte), false);

  /* Nenhuma coleta nasce deste caminho. */
  const aviso = readFileSync(new URL("../lib/editorial/local-recovery.ts", import.meta.url), "utf8");
  const rotulo = readFileSync(new URL("../lib/radar/persisted-operation.ts", import.meta.url), "utf8");
  for (const modulo of [aviso, rotulo]) {
    assert.equal(/fetch\(|collectSerp|dataforseo/i.test(modulo), false, "copy não fala com provider");
  }

  /* E o ciclo da Fase 1 não foi tocado: o rótulo lê o payload, não o decide. */
  assert.equal(/RadarPhase1Action|radarDeepResearchState|RADAR_OPERATIONAL_STATUS/.test(rotulo), false, "LIFECYCLE_CHANGED = NO");
});

/* ==========  G · A CONTA  ============================================ */

test("RADAR 18.9.1 · G — nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS = 0 — tentativas: ${tentativasDeRede.join(", ")}`);
});
